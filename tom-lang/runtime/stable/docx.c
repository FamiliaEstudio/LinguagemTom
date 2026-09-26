#include "docx.h"
#include "file_io.h"
#define MINIZ_NO_ZLIB_COMPATIBLE_NAMES
#include <miniz.h>
#include <libxml/parser.h>
#include <libxml/tree.h>
#include <libxml/xmlwriter.h>
#include <stdlib.h>
#include <string.h>
#include <utf8proc.h>
#define WORD "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
#define STRICT_WORD "http://purl.oclc.org/ooxml/wordprocessingml/main"
#define DOC_LIMIT 67108864
#define ZIP_LIMIT 536870912
static int named(xmlNode *n,const char *name){return n&&n->type==XML_ELEMENT_NODE&&xmlStrEqual(n->name,BAD_CAST name)&&n->ns&&(xmlStrEqual(n->ns->href,BAD_CAST WORD)||xmlStrEqual(n->ns->href,BAD_CAST STRICT_WORD));}
static xmlNode *child(xmlNode *n,const char *name){for(xmlNode *p=n?n->children:NULL;p;p=p->next)if(named(p,name))return p;return NULL;}
static xmlChar *attribute(xmlNode *n,const char *name){if(!n)return NULL;xmlChar *v=xmlGetNsProp(n,BAD_CAST name,BAD_CAST WORD);if(!v)v=xmlGetNsProp(n,BAD_CAST name,BAD_CAST STRICT_WORD);return v;}
static int truth(xmlNode *n){xmlChar *v=attribute(n,"val");int yes=!v||(!xmlStrEqual(v,BAD_CAST "0")&&!xmlStrEqual(v,BAD_CAST "false")&&!xmlStrEqual(v,BAD_CAST "off"));xmlFree(v);return yes;}
static int32_t warning(TomText *out,const char *text){if(strstr(out->data,text))return TOM_OK;int32_t e=tom_text_append(out,text);return e?e:tom_text_append(out,"\n");}
static uint32_t properties(xmlNode *r,uint32_t style,TomText *warnings){
 xmlNode *n;const char *names[]={"b","i","u"};for(int i=0;i<3;i++)if((n=child(r,names[i]))){int value=truth(n);xmlChar *v=attribute(n,"val");if(i==2&&v&&xmlStrEqual(v,BAD_CAST "none"))value=0;xmlFree(v);style=value?style|(1u<<i):style&~(1u<<i);}
 if((n=child(r,"sz"))){xmlChar *v=attribute(n,"val");if(v){char *end=NULL;long half=strtol((char*)v,&end,10);if(!end||*end||half<16||half>144)warning(warnings,"Tamanho de fonte fora de 8–72 pt foi ajustado.");if(half>=16&&half<=144&&(half%2))warning(warnings,"Tamanhos fracionários foram arredondados para pontos inteiros.");if(half<16)half=16;if(half>144)half=144;style=(style&7)|((uint32_t)((half+1)/2)<<8);xmlFree(v);}}
 for(xmlNode *p=r?r->children:NULL;p;p=p->next)if(named(p,"color")||named(p,"highlight")||named(p,"vertAlign"))warning(warnings,"Cor, destaque e sobrescrito/subscrito não são representados pelo editor.");
 if(child(r,"rFonts"))warning(warnings,"A família da fonte é substituída pela fonte do editor.");
 if(child(r,"strike")||child(r,"dstrike")||child(r,"caps")||child(r,"smallCaps")||child(r,"vanish"))warning(warnings,"Tachado, versaletes e texto oculto não são representados pelo editor.");
 return style;
}
static uint32_t alignment(xmlNode *p,uint32_t current){xmlChar *v=attribute(child(p,"jc"),"val");if(v){current=xmlStrEqual(v,BAD_CAST "center")?1:xmlStrEqual(v,BAD_CAST "right")||xmlStrEqual(v,BAD_CAST "end")?2:xmlStrEqual(v,BAD_CAST "both")||xmlStrEqual(v,BAD_CAST "distribute")?3:0;xmlFree(v);}return current;}
static xmlNode *find_style(xmlDoc *styles,const xmlChar *id){for(xmlNode *n=styles?xmlDocGetRootElement(styles)->children:NULL;n;n=n->next){xmlChar *v=attribute(n,"styleId");int match=v&&id&&xmlStrEqual(v,id);xmlFree(v);if(match)return n;}return NULL;}
static void apply_style(xmlDoc *styles,const xmlChar *id,uint32_t *style,uint32_t *align,TomText *warnings,int depth){
 if(depth>32){warning(warnings,"Cadeia de estilos circular ou muito profunda foi interrompida.");return;}xmlNode *n=find_style(styles,id);if(!n)return;xmlChar *base=attribute(child(n,"basedOn"),"val");if(base){apply_style(styles,base,style,align,warnings,depth+1);xmlFree(base);}*style=properties(child(n,"rPr"),*style,warnings);*align=alignment(child(n,"pPr"),*align);
}
typedef struct{TomText *text,*warnings;TomDocRun *runs,*paragraphs;size_t nr,np,cr,cp;uint32_t count,style,align;xmlDoc *styles;int paragraphs_seen;int32_t error;} Import;
static void add_run(TomDocRun **runs,size_t *n,size_t *cap,uint32_t pos,uint32_t value,int *error){if(*error)return;if(*n==*cap){size_t c=*cap?*cap*2:32;TomDocRun *p=realloc(*runs,c*sizeof(*p));if(!p){*error=TOM_MEMORY;return;}*runs=p;*cap=c;}(*runs)[(*n)++]=(TomDocRun){pos,value};}
static void append(Import *in,const char *text,uint32_t style,uint32_t align){
 if(in->error||!*text)return;in->error=tom_text_append(in->text,text);if(in->error)return;
 for(const unsigned char *p=(const unsigned char*)text;*p;p++){if((*p&0xc0)!=0x80)in->count++;if(*p=='\n')add_run(&in->paragraphs,&in->np,&in->cp,in->count,align,&in->error);}
 if(in->nr&&in->runs[in->nr-1].value==style)in->runs[in->nr-1].pos=in->count;else add_run(&in->runs,&in->nr,&in->cr,in->count,style,&in->error);
}
static void inline_nodes(Import *in,xmlNode *nodes,uint32_t style,uint32_t align,int depth){
 if(depth>128){in->error=TOM_CAPACITY;return;}
 for(xmlNode *n=nodes;n&&!in->error;n=n->next){
  if(named(n,"r")){uint32_t run=style,unused=align;xmlNode *props=child(n,"rPr");xmlChar *id=attribute(child(props,"rStyle"),"val");if(id){apply_style(in->styles,id,&run,&unused,in->warnings,0);xmlFree(id);}run=properties(props,run,in->warnings);inline_nodes(in,n->children,run,align,depth+1);}
  else if(named(n,"t")){xmlChar *v=xmlNodeGetContent(n);if(v){append(in,(char*)v,style,align);xmlFree(v);}}
  else if(named(n,"tab"))append(in,"\t",style,align);
  else if(named(n,"br")||named(n,"cr")){xmlChar *type=attribute(n,"type");if(type&&!xmlStrEqual(type,BAD_CAST "textWrapping"))in->error=warning(in->warnings,"Quebras de página e coluna foram convertidas em quebras de linha.");xmlFree(type);append(in,"\n",style,align);}
  else if(named(n,"noBreakHyphen"))append(in,"‑",style,align);
  else if(named(n,"softHyphen"))append(in,"\xc2\xad",style,align);
  else if(named(n,"drawing")||named(n,"pict")||named(n,"object"))in->error=warning(in->warnings,"Imagens e objetos permanecem somente no arquivo original.");
  else if(named(n,"footnoteReference")||named(n,"endnoteReference"))in->error=warning(in->warnings,"Notas de rodapé e de fim permanecem somente no arquivo original.");
  else if(named(n,"del"))in->error=warning(in->warnings,"Controle de alterações: trechos excluídos permanecem somente no original.");
  else if(named(n,"sym")||named(n,"fldChar")||named(n,"instrText")||named(n,"commentReference"))in->error=warning(in->warnings,"Símbolos especiais, campos automáticos e comentários permanecem somente no original.");
  else if(named(n,"rPr")||named(n,"pPr"))continue;
  else {if(named(n,"hyperlink"))in->error=warning(in->warnings,"Hiperlinks foram convertidos em texto.");if(named(n,"ins"))in->error=warning(in->warnings,"Controle de alterações: inserções foram incorporadas ao texto.");inline_nodes(in,n->children,style,align,depth+1);}
 }
}
static void blocks(Import *in,xmlNode *nodes,int depth){
 if(depth>128){in->error=TOM_CAPACITY;return;}
 for(xmlNode *n=nodes;n&&!in->error;n=n->next){if(named(n,"p")){
   uint32_t style=in->style,align=in->align;xmlNode *props=child(n,"pPr");xmlChar *id=attribute(child(props,"pStyle"),"val");if(id){apply_style(in->styles,id,&style,&align,in->warnings,0);xmlFree(id);}align=alignment(props,align);style=properties(child(props,"rPr"),style,in->warnings);
   if(in->paragraphs_seen++)append(in,"\n",in->nr?in->runs[in->nr-1].value:style,align);
   if(in->np)in->paragraphs[in->np-1].value=align;else add_run(&in->paragraphs,&in->np,&in->cp,0,align,&in->error);
   if(child(props,"ind")||child(props,"tabs")||child(props,"spacing")||child(props,"pBdr"))in->error=warning(in->warnings,"Recuos, tabulações configuradas, espaçamento e bordas de parágrafo não são preservados.");
   if(child(props,"numPr"))in->error=warning(in->warnings,"Listas foram convertidas em parágrafos; marcadores automáticos não foram preservados.");
   inline_nodes(in,n->children,style,align,0);
  }else {if(named(n,"tbl"))in->error=warning(in->warnings,"Tabelas foram convertidas em parágrafos na ordem das células.");blocks(in,n->children,depth+1);}}
}
static xmlDoc *part(mz_zip_archive *zip,const char *name,int required,int32_t *error){
 int i=mz_zip_reader_locate_file(zip,name,NULL,0);if(i<0){if(required)*error=TOM_INVALID;return NULL;}mz_zip_archive_file_stat stat;if(!mz_zip_reader_file_stat(zip,i,&stat)||stat.m_uncomp_size>DOC_LIMIT){*error=TOM_CAPACITY;return NULL;}
 size_t size=0;void *bytes=mz_zip_reader_extract_to_heap(zip,i,&size,0);if(!bytes){*error=TOM_INVALID;return NULL;}
 xmlDoc *doc=xmlReadMemory(bytes,(int)size,name,NULL,XML_PARSE_NONET|XML_PARSE_NO_XXE|XML_PARSE_NOERROR|XML_PARSE_NOWARNING);mz_free(bytes);
 if(!doc||doc->intSubset||doc->extSubset){xmlFreeDoc(doc);*error=TOM_INVALID;return NULL;}return doc;
}
int32_t tom_docx_read(const char *path,TomDocument *out,TomText *warnings){
 if(!out||!warnings)return TOM_INVALID;unsigned char *bytes=NULL;size_t size=0;int32_t error=tom_file_read_all(path,ZIP_LIMIT,&bytes,&size);if(error)return error;
 mz_zip_archive zip={0};if(!mz_zip_reader_init_mem(&zip,bytes,size,0)){free(bytes);return TOM_INVALID;}
 Import in={0};in.style=12u<<8;error=tom_text_dynamic_new("",DOC_LIMIT,&in.text);if(!error)error=tom_text_dynamic_new("",1048576,&in.warnings);
 if(!error){for(mz_uint i=0;i<mz_zip_reader_get_num_files(&zip);i++){mz_zip_archive_file_stat entry;if(mz_zip_reader_file_stat(&zip,i,&entry)&&(!strncmp(entry.m_filename,"word/header",11)||!strncmp(entry.m_filename,"word/footer",11))){error=warning(in.warnings,"Cabeçalhos e rodapés permanecem somente no arquivo original.");break;}}}
 xmlDoc *doc=NULL;if(!error)doc=part(&zip,"word/document.xml",1,&error);if(!error)in.styles=part(&zip,"word/styles.xml",0,&error);
 if(!error){xmlNode *defaults=child(in.styles?xmlDocGetRootElement(in.styles):NULL,"docDefaults");in.style=properties(child(child(defaults,"rPrDefault"),"rPr"),in.style,in.warnings);in.align=alignment(child(child(defaults,"pPrDefault"),"pPr"),0);
  /* Apply the default paragraph style before explicit styles. */
  for(xmlNode *n=in.styles?xmlDocGetRootElement(in.styles)->children:NULL;n;n=n->next){xmlChar *is_default=attribute(n,"default"),*type=attribute(n,"type"),*id=attribute(n,"styleId");if(is_default&&type&&xmlStrEqual(type,BAD_CAST "paragraph")&&!xmlStrEqual(is_default,BAD_CAST "0"))apply_style(in.styles,id,&in.style,&in.align,in.warnings,0);xmlFree(is_default);xmlFree(type);xmlFree(id);}
  xmlNode *body=child(xmlDocGetRootElement(doc),"body");if(!body)error=TOM_INVALID;else{blocks(&in,body->children,0);error=in.error;}}
 TomDocument *parsed=NULL;TomText *json=NULL;
 if(!error)error=tom_document_new(in.text->data,out->state.text->limit,out->history_limit,&parsed);
 if(!error&&in.nr){/* A Word run may split a Unicode grapheme; keep the first style for that grapheme. */
  size_t used=0;uint32_t previous=0;for(size_t i=0;i<in.nr;i++){uint32_t end=in.runs[i].pos;while(end<parsed->state.count&&!parsed->state.boundaries[end])end++;if(end<=previous)continue;TomDocRun r={end,in.runs[i].value};if(used&&in.runs[used-1].value==r.value)in.runs[used-1].pos=end;else in.runs[used++]=r;previous=end;}
  if(used){free(parsed->state.runs);parsed->state.runs=in.runs;parsed->state.run_count=used;in.runs=NULL;}}
 if(!error&&in.np==parsed->state.paragraph_count)for(size_t i=0;i<in.np;i++)parsed->state.paragraphs[i].value=in.paragraphs[i].value;
 if(!error)error=tom_text_dynamic_new("",268435456,&json);if(!error)error=tom_document_serialize(parsed,json);
 /* Validate before publishing either destination. */
 if(!error&&(warnings->limit?warnings->limit:warnings->capacity)<=strlen(in.warnings->data))error=TOM_CAPACITY;
 if(!error)error=tom_text_set(warnings,in.warnings->data);if(!error)error=tom_document_load(out,json->data);
 tom_text_free(json);tom_document_free(parsed);xmlFreeDoc(doc);xmlFreeDoc(in.styles);free(in.runs);free(in.paragraphs);tom_text_free(in.text);tom_text_free(in.warnings);mz_zip_reader_end(&zip);free(bytes);return error;
}
static int start(xmlTextWriter *w,const char *tag){return xmlTextWriterStartElement(w,BAD_CAST tag);}
static int attr(xmlTextWriter *w,const char *name,const char *value){return xmlTextWriterWriteAttribute(w,BAD_CAST name,BAD_CAST value);}
static int property(xmlTextWriter *w,const char *tag,const char *value){if(start(w,tag)<0)return -1;if(value&&attr(w,"w:val",value)<0)return -1;return xmlTextWriterEndElement(w);}
static int zip_add(mz_zip_archive *z,const char *path,const void *data,size_t n){return mz_zip_writer_add_mem(z,path,data,n,MZ_DEFAULT_COMPRESSION);}
int32_t tom_docx_write(const char *path,TomDocument *doc){
 if(!doc||!tom_utf8_valid(path))return TOM_INVALID;
 for(uint32_t cp=0;cp<doc->state.count;cp++){utf8proc_int32_t value;utf8proc_ssize_t used=utf8proc_iterate((const unsigned char*)doc->state.text->data+doc->state.offsets[cp],-1,&value);if(used<0||(value<32&&value!=9&&value!=10&&value!=13)||value==0xfffe||value==0xffff)return TOM_INVALID;}
 xmlBuffer *buffer=xmlBufferCreate();xmlTextWriter *w=buffer?xmlNewTextWriterMemory(buffer,0):NULL;if(!w){xmlBufferFree(buffer);return TOM_MEMORY;}
 int okay=xmlTextWriterStartDocument(w,NULL,"UTF-8",NULL)>=0&&start(w,"w:document")>=0&&attr(w,"xmlns:w",WORD)>=0&&start(w,"w:body")>=0;
 for(size_t p=0;okay&&p<doc->state.paragraph_count;p++){
  uint32_t begin=doc->state.paragraphs[p].pos,end=p+1<doc->state.paragraph_count?doc->state.paragraphs[p+1].pos-1:doc->state.count;
  const char *align[]={"left","center","right","both"};okay=start(w,"w:p")>=0&&start(w,"w:pPr")>=0&&property(w,"w:jc",align[doc->state.paragraphs[p].value])>=0&&start(w,"w:spacing")>=0&&attr(w,"w:before","0")>=0&&attr(w,"w:after","0")>=0&&xmlTextWriterEndElement(w)>=0&&xmlTextWriterEndElement(w)>=0;
  for(uint32_t at=begin;okay&&at<end;){uint32_t style=tom_document_style_at(doc,at),stop=at+1;while(stop<end&&tom_document_style_at(doc,stop)==style)stop++;
   char points[24];snprintf(points,sizeof(points),"%u",(style>>8)*2);okay=start(w,"w:r")>=0&&start(w,"w:rPr")>=0&&property(w,"w:sz",points)>=0;
   if(okay&&(style&1))okay=property(w,"w:b",NULL)>=0;if(okay&&(style&2))okay=property(w,"w:i",NULL)>=0;if(okay&&(style&4))okay=property(w,"w:u","single")>=0;
   okay=okay&&xmlTextWriterEndElement(w)>=0;
   uint32_t chunk=at;while(okay&&chunk<stop){uint32_t next=chunk;while(next<stop&&doc->state.text->data[doc->state.offsets[next]]!='\t')next++;
    if(next>chunk){size_t a=doc->state.offsets[chunk],b=doc->state.offsets[next];xmlChar *value=xmlStrndup(BAD_CAST doc->state.text->data+a,(int)(b-a));okay=value&&start(w,"w:t")>=0&&attr(w,"xml:space","preserve")>=0&&xmlTextWriterWriteString(w,value)>=0&&xmlTextWriterEndElement(w)>=0;xmlFree(value);}
    if(next<stop){okay=property(w,"w:tab",NULL)>=0;next++;}chunk=next;
   }okay=okay&&xmlTextWriterEndElement(w)>=0;at=stop;
  }okay=okay&&xmlTextWriterEndElement(w)>=0;
 }
 okay=okay&&xmlTextWriterEndElement(w)>=0&&xmlTextWriterEndElement(w)>=0&&xmlTextWriterEndDocument(w)>=0;xmlFreeTextWriter(w);
 mz_zip_archive zip={0};int32_t error=okay?TOM_OK:TOM_MEMORY;void *archive=NULL;size_t archive_size=0;
 const char *types="<?xml version=\"1.0\" encoding=\"UTF-8\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>";
 const char *rels="<?xml version=\"1.0\" encoding=\"UTF-8\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>";
 if(!error&&(!mz_zip_writer_init_heap(&zip,0,0)||!zip_add(&zip,"[Content_Types].xml",types,strlen(types))||!zip_add(&zip,"_rels/.rels",rels,strlen(rels))||!zip_add(&zip,"word/document.xml",xmlBufferContent(buffer),xmlBufferLength(buffer))||!mz_zip_writer_finalize_heap_archive(&zip,&archive,&archive_size)))error=TOM_MEMORY;
 if(!error)error=tom_file_write_all(path,archive,archive_size);mz_free(archive);mz_zip_writer_end(&zip);xmlBufferFree(buffer);return error;
}
