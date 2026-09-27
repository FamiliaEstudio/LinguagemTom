#include "xlsx.h"
#include "file_io.h"
#define MINIZ_NO_ZLIB_COMPATIBLE_NAMES
#include <miniz.h>
#include <libxml/parser.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>

#define SS "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
#define STRICT_SS "http://purl.oclc.org/ooxml/spreadsheetml/main"
#define REL "http://schemas.openxmlformats.org/package/2006/relationships"
#define DOC_REL "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
#define STRICT_REL "http://purl.oclc.org/ooxml/officeDocument/relationships/"
#define XML_LIMIT (64u * 1024u * 1024u)
#define TEXT_LIMIT (32u * 1024u * 1024u)
#define CELL_LIMIT 250000u
#define ROW_LIMIT 50000u

typedef struct {
    mz_zip_archive zip;
    size_t xml_bytes, text_bytes, cells;
    TomXlsxProgress progress;
    void *context;
    char *message;
    size_t capacity;
    int32_t error;
} Reader;

static void fail(Reader *r, int32_t error, const char *message) {
    if (!r->error) {
        r->error = error;
        snprintf(r->message, r->capacity, "%s", message);
    }
}
static int tick(Reader *r, int percent) {
    if (!r->error && r->progress) r->error = r->progress(r->context, percent);
    return !r->error;
}
static int ns(xmlNode *n, const char *uri) {
    return n && n->type == XML_ELEMENT_NODE && n->ns && xmlStrEqual(n->ns->href, BAD_CAST uri);
}
static int named(xmlNode *n, const char *name) {
    return (ns(n, SS) || ns(n, STRICT_SS)) && xmlStrEqual(n->name, BAD_CAST name);
}
static xmlNode *child(xmlNode *n, const char *name) {
    for (xmlNode *p = n ? n->children : NULL; p; p = p->next) if (named(p, name)) return p;
    return NULL;
}
static xmlDoc *part(Reader *r, const char *name) {
    if (!tick(r, 20)) return NULL;
    int index = mz_zip_reader_locate_file(&r->zip, name, NULL, 0);
    mz_zip_archive_file_stat stat;
    if (index < 0 || !mz_zip_reader_file_stat(&r->zip, index, &stat)) {
        fail(r, TOM_INVALID, "XLSX incompleto: parte obrigatória ausente."); return NULL;
    }
    if (stat.m_uncomp_size > XML_LIMIT || r->xml_bytes + stat.m_uncomp_size > 2 * XML_LIMIT) {
        fail(r, TOM_CAPACITY, "XLSX excede o limite de XML (64 MiB por parte; 128 MiB no total)."); return NULL;
    }
    r->xml_bytes += (size_t)stat.m_uncomp_size;
    size_t size = 0;
    void *bytes = mz_zip_reader_extract_to_heap(&r->zip, index, &size, 0);
    if (!bytes) { fail(r, TOM_INVALID, "XLSX corrompido ou protegido por senha."); return NULL; }
    xmlDoc *doc = xmlReadMemory(bytes, (int)size, name, NULL,
        XML_PARSE_NONET | XML_PARSE_NO_XXE | XML_PARSE_NOERROR | XML_PARSE_NOWARNING);
    mz_free(bytes);
    if (!doc || doc->intSubset || doc->extSubset) {
        xmlFreeDoc(doc); fail(r, TOM_INVALID, "XML inválido no XLSX; DTD e entidades externas não são aceitos."); return NULL;
    }
    return doc;
}
/* Resolve OPC part names without extracting anything to the filesystem. */
static int resolve(const char *base, const char *target, char out[2048]) {
    if (!target || !*target || strchr(target, '\\') || strchr(target, ':') ||
        strchr(target, '#') || strchr(target, '?') || strchr(target, '%')) return 0;
    char joined[4096];
    const char *slash = strrchr(base, '/');
    size_t prefix = *target == '/' ? 0 : slash ? (size_t)(slash - base + 1) : 0;
    if (prefix + strlen(target) >= sizeof(joined)) return 0;
    memcpy(joined, base, prefix); strcpy(joined + prefix, *target == '/' ? target + 1 : target);
    size_t used = 0; char *at = joined;
    while (*at) {
        char *end = strchr(at, '/'); size_t n = end ? (size_t)(end - at) : strlen(at);
        if (!n) return 0;
        if (n == 2 && !memcmp(at, "..", 2)) {
            if (!used) return 0;
            while (used && out[used - 1] != '/') used--;
            if (used) used--;
        } else if (!(n == 1 && *at == '.')) {
            if (used + n + 2 > 2048) return 0;
            if (used) out[used++] = '/';
            memcpy(out + used, at, n); used += n;
        }
        if (!end) break;
        at = end + 1;
    }
    out[used] = 0; return used != 0;
}
static int rel_type(const xmlChar *type, const char *suffix) {
    if (!type) return 0;
    const char *s = (const char *)type;
    return (!strncmp(s, DOC_REL, strlen(DOC_REL)) && !strcmp(s + strlen(DOC_REL), suffix)) ||
           (!strncmp(s, STRICT_REL, strlen(STRICT_REL)) && !strcmp(s + strlen(STRICT_REL), suffix));
}
static int relationship(Reader *r, xmlDoc *doc, const char *base, const char *id,
                        const char *type, int required, char out[2048]) {
    int found = 0; out[0] = 0;
    xmlNode *root = doc ? xmlDocGetRootElement(doc) : NULL;
    if (!ns(root, REL) || !xmlStrEqual(root->name, BAD_CAST "Relationships")) {
        fail(r, TOM_INVALID, "Relacionamentos inválidos no XLSX."); return 0;
    }
    for (xmlNode *n = root->children; n && !r->error; n = n->next) {
        if (!ns(n, REL) || !xmlStrEqual(n->name, BAD_CAST "Relationship")) continue;
        xmlChar *key = xmlGetProp(n, BAD_CAST "Id"), *kind = xmlGetProp(n, BAD_CAST "Type");
        if ((!id || (key && !strcmp(id, (char *)key))) && rel_type(kind, type)) {
            xmlChar *target = xmlGetProp(n, BAD_CAST "Target"), *mode = xmlGetProp(n, BAD_CAST "TargetMode");
            if (found++ || (mode && !xmlStrEqual(mode, BAD_CAST "Internal")) || !resolve(base, (char *)target, out))
                fail(r, TOM_INVALID, "Relacionamento duplicado, externo ou incompatível no XLSX.");
            xmlFree(target); xmlFree(mode);
        }
        xmlFree(key); xmlFree(kind);
    }
    if (!found && required) fail(r, TOM_INVALID, "Relacionamento obrigatório ausente no XLSX.");
    return found && !r->error;
}
static int hex4(const char *s, uint32_t *out) {
    uint32_t value = 0;
    for (int i = 0; i < 4; i++) {
        unsigned char c = (unsigned char)s[i];
        unsigned digit = c >= '0' && c <= '9' ? c - '0' : c >= 'A' && c <= 'F' ? c - 'A' + 10 : c >= 'a' && c <= 'f' ? c - 'a' + 10 : 16;
        if (digit == 16) return 0;
        value = value * 16 + digit;
    }
    *out = value; return 1;
}
static int escaped(const char *s, size_t n, uint32_t *value) {
    return n >= 7 && s[0] == '_' && s[1] == 'x' && s[6] == '_' && hex4(s + 2, value);
}
/* Decode ST_Xstring exactly once: _x005F_x000A_ is the literal _x000A_. */
static char *decode(Reader *r, const char *s) {
    size_t length = strlen(s), used = 0;
    char *out = malloc(length + 1);
    if (!out) { fail(r, TOM_MEMORY, "Memória insuficiente para ler o XLSX."); return NULL; }
    for (size_t i = 0; i < length;) {
        uint32_t cp;
        if (!escaped(s + i, length - i, &cp)) { out[used++] = s[i++]; continue; }
        i += 7;
        if (cp >= 0xd800 && cp <= 0xdbff) {
            uint32_t low;
            if (!escaped(s + i, length - i, &low) || low < 0xdc00 || low > 0xdfff) {
                fail(r, TOM_INVALID, "Escape Unicode inválido no XLSX."); break;
            }
            cp = 0x10000 + ((cp - 0xd800) << 10) + low - 0xdc00; i += 7;
        }
        if (!cp || (cp >= 0xd800 && cp <= 0xdfff)) { fail(r, TOM_INVALID, "Caractere Unicode incompatível no XLSX."); break; }
        if (cp < 0x80) out[used++] = (char)cp;
        else if (cp < 0x800) { out[used++] = (char)(0xc0 | (cp >> 6)); out[used++] = (char)(0x80 | (cp & 63)); }
        else if (cp < 0x10000) { out[used++] = (char)(0xe0 | (cp >> 12)); out[used++] = (char)(0x80 | ((cp >> 6) & 63)); out[used++] = (char)(0x80 | (cp & 63)); }
        else { out[used++] = (char)(0xf0 | (cp >> 18)); out[used++] = (char)(0x80 | ((cp >> 12) & 63)); out[used++] = (char)(0x80 | ((cp >> 6) & 63)); out[used++] = (char)(0x80 | (cp & 63)); }
    }
    out[used] = 0;
    if (r->error || !tom_utf8_valid(out)) { free(out); fail(r, TOM_INVALID, "Texto Unicode inválido no XLSX."); return NULL; }
    return out;
}
static char *rich_text(Reader *r, xmlNode *node) {
    xmlBuffer *buffer = xmlBufferCreate();
    if (!buffer) { fail(r, TOM_MEMORY, "Memória insuficiente para ler célula."); return NULL; }
    for (xmlNode *n = node ? node->children : NULL; n && !r->error; n = n->next) {
        /* Phonetic annotations are not the cell value. */
        xmlNode *text = named(n, "t") ? n : named(n, "r") ? child(n, "t") : NULL;
        if (!text) continue;
        xmlChar *value = xmlNodeGetContent(text);
        if (!value || xmlBufferCat(buffer, value)) fail(r, TOM_MEMORY, "Memória insuficiente para ler célula.");
        xmlFree(value);
    }
    char *value = r->error ? NULL : decode(r, (char *)xmlBufferContent(buffer));
    xmlBufferFree(buffer); return value;
}
static int number(const char *s, uint32_t limit, uint32_t *out) {
    if (!s || !*s) return 0;
    uint32_t value = 0;
    for (; *s; s++) { if (*s < '0' || *s > '9' || value > (limit - (unsigned)(*s - '0')) / 10) return 0; value = value * 10 + (unsigned)(*s - '0'); }
    *out = value; return value <= limit;
}
static int coordinate(const char *s, uint32_t row, uint32_t *column) {
    if (!s) return 0;
    uint32_t col = 0, r = 0;
    while (*s >= 'A' && *s <= 'Z') { col = col * 26 + (unsigned)(*s++ - 'A' + 1); if (col > 16384) return 0; }
    if (!col || !number(s, 1048576, &r) || r != row) return 0;
    *column = col; return 1;
}
static void address(uint32_t col, uint32_t row, char out[32]) {
    char letters[4]; size_t n = 0;
    while (col) { col--; letters[n++] = (char)('A' + col % 26); col /= 26; }
    size_t used = 0; while (n) out[used++] = letters[--n];
    snprintf(out + used, 32 - used, "%u", row);
}
static void cell(Reader *r, yyjson_mut_doc *doc, yyjson_mut_val *cells, xmlNode *node,
                 uint32_t row, uint32_t *previous, char **strings, size_t count) {
    xmlChar *ref = xmlGetProp(node, BAD_CAST "r"), *type = xmlGetProp(node, BAD_CAST "t");
    uint32_t col = *previous + 1;
    if ((ref && !coordinate((char *)ref, row, &col)) || col <= *previous || col > 16384) {
        fail(r, TOM_INVALID, "Coordenadas de células inválidas, repetidas ou fora de ordem."); goto done;
    }
    *previous = col;
    const char *kind = "vazio"; char *value = NULL;
    xmlNode *v = child(node, "v"), *in = child(node, "is"), *formula = child(node, "f");
    if (formula) { kind = "formula"; value = (char *)xmlNodeGetContent(formula); }
    else if (type && xmlStrEqual(type, BAD_CAST "inlineStr")) { kind = "texto"; value = rich_text(r, in); }
    else if (type && xmlStrEqual(type, BAD_CAST "s")) {
        xmlChar *index = v ? xmlNodeGetContent(v) : NULL; uint32_t i = 0;
        if (!number((char *)index, CELL_LIMIT, &i) || i >= count) fail(r, TOM_INVALID, "Índice de texto compartilhado inválido no XLSX.");
        else { kind = "texto"; value = malloc(strlen(strings[i]) + 1); if (value) strcpy(value, strings[i]); }
        xmlFree(index);
    } else if (v) {
        kind = !type || xmlStrEqual(type, BAD_CAST "n") ? "numero" : xmlStrEqual(type, BAD_CAST "b") ? "booleano" :
               xmlStrEqual(type, BAD_CAST "e") ? "erro" : xmlStrEqual(type, BAD_CAST "d") ? "data" :
               xmlStrEqual(type, BAD_CAST "str") ? "texto" : "desconhecido";
        xmlChar *raw = xmlNodeGetContent(v);
        if (raw) value = decode(r, (char *)raw);
        xmlFree(raw);
    } else { value = malloc(1); if (value) *value = 0; }
    if (!value && !r->error) fail(r, TOM_MEMORY, "Não foi possível ler a célula do XLSX.");
    if (!r->error) {
        r->text_bytes += strlen(value);
        if (++r->cells > CELL_LIMIT || r->text_bytes > TEXT_LIMIT) fail(r, TOM_CAPACITY, "Planilha excede 250.000 células ou 32 MiB de valores.");
    }
    if (!r->error) {
        char coord[32]; address(col, row, coord);
        uint32_t utf16 = 0;
        for (const unsigned char *p = (const unsigned char *)value; *p; p++)
            if ((*p & 0xc0) != 0x80) utf16 += *p >= 0xf0 ? 2 : 1;
        yyjson_mut_val *c = yyjson_mut_obj(doc);
        if (!c || !yyjson_mut_obj_add_uint(doc, c, "coluna", col) ||
            !yyjson_mut_obj_add_strcpy(doc, c, "referencia", coord) ||
            !yyjson_mut_obj_add_str(doc, c, "tipo", kind) ||
            !yyjson_mut_obj_add_uint(doc, c, "unidades_utf16", utf16) ||
            !yyjson_mut_obj_add_strcpy(doc, c, "valor", value) || !yyjson_mut_arr_append(cells, c))
            fail(r, TOM_MEMORY, "Memória insuficiente para os valores da planilha.");
    }
    if (formula) xmlFree(value); else free(value);
done:
    xmlFree(ref); xmlFree(type);
}
int32_t tom_xlsx_read(const char *path, const char *sheet, yyjson_mut_doc *result,
                     TomXlsxProgress progress, void *context, char *message, size_t capacity) {
    Reader r = {0}; r.progress = progress; r.context = context; r.message = message; r.capacity = capacity;
    unsigned char *bytes = NULL; size_t size = 0;
    xmlDoc *rels = NULL, *workbook = NULL, *bookrels = NULL, *shared = NULL, *worksheet = NULL;
    char **strings = NULL; size_t count = 0;
    char book[2048], relpath[4096], sheetpath[2048], sharedpath[2048];
    if (!tick(&r, 10)) goto done;
    r.error = tom_file_read_all(path, 536870912, &bytes, &size);
    if (r.error) goto done;
    if (!mz_zip_reader_init_mem(&r.zip, bytes, size, 0)) { fail(&r, TOM_INVALID, "Arquivo XLSX inválido, corrompido ou protegido por senha."); goto done; }
    rels = part(&r, "_rels/.rels");
    if (r.error || !relationship(&r, rels, "", NULL, "officeDocument", 1, book)) goto done;
    workbook = part(&r, book); if (r.error) goto done;
    if (!named(xmlDocGetRootElement(workbook), "workbook")) { fail(&r, TOM_INVALID, "O arquivo não contém uma pasta de trabalho XLSX."); goto done; }
    const char *last = strrchr(book, '/'); size_t prefix = last ? (size_t)(last - book + 1) : 0;
    snprintf(relpath, sizeof(relpath), "%.*s_rels/%s.rels", (int)prefix, book, book + prefix);
    bookrels = part(&r, relpath); if (r.error) goto done;
    xmlNode *sheets = child(xmlDocGetRootElement(workbook), "sheets"); int found = 0;
    for (xmlNode *n = sheets ? sheets->children : NULL; n && !r.error; n = n->next) {
        if (!named(n, "sheet")) continue;
        xmlChar *name = xmlGetProp(n, BAD_CAST "name");
        if (name && !strcmp((char *)name, sheet)) {
            xmlChar *id = xmlGetNsProp(n, BAD_CAST "id", BAD_CAST "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
            if (!id) id = xmlGetNsProp(n, BAD_CAST "id", BAD_CAST "http://purl.oclc.org/ooxml/officeDocument/relationships");
            if (found++ || !id) fail(&r, TOM_INVALID, "Identificação da aba inválida ou repetida.");
            else relationship(&r, bookrels, book, (char *)id, "worksheet", 1, sheetpath);
            xmlFree(id);
        }
        xmlFree(name);
    }
    if (!found) { fail(&r, TOM_INVALID, "A aba solicitada não existe no XLSX."); goto done; }
    if (r.error) goto done;
    if (relationship(&r, bookrels, book, NULL, "sharedStrings", 0, sharedpath)) {
        shared = part(&r, sharedpath); if (r.error) goto done;
        if (!named(xmlDocGetRootElement(shared), "sst")) { fail(&r, TOM_INVALID, "Tabela de textos compartilhados inválida."); goto done; }
        size_t allocated = 0, shared_bytes = 0;
        for (xmlNode *n = xmlDocGetRootElement(shared)->children; n && tick(&r, 30); n = n->next) {
            if (!named(n, "si")) continue;
            if (count >= CELL_LIMIT) { fail(&r, TOM_CAPACITY, "XLSX excede 250.000 textos compartilhados."); break; }
            if (count == allocated) {
                size_t next = allocated ? allocated * 2 : 128; char **p = realloc(strings, next * sizeof(*p));
                if (!p) { fail(&r, TOM_MEMORY, "Memória insuficiente para textos compartilhados."); break; }
                strings = p; allocated = next;
            }
            char *s = rich_text(&r, n); if (!s) break;
            shared_bytes += strlen(s); strings[count++] = s;
            if (shared_bytes > TEXT_LIMIT) fail(&r, TOM_CAPACITY, "Textos compartilhados excedem 32 MiB.");
        }
    }
    if (r.error) goto done;
    worksheet = part(&r, sheetpath); if (r.error) goto done;
    xmlNode *root = xmlDocGetRootElement(worksheet), *data = child(root, "sheetData");
    if (!named(root, "worksheet") || !data) { fail(&r, TOM_INVALID, "Aba XLSX incompatível ou sem células."); goto done; }
    if (child(root, "mergeCells")) { fail(&r, TOM_INVALID, "A aba contém células mescladas. Desfaça as mesclagens antes de importar."); goto done; }
    yyjson_mut_val *output = yyjson_mut_obj(result), *rows = yyjson_mut_arr(result);
    if (!output || !rows || !yyjson_mut_obj_add_strcpy(result, output, "aba", sheet) || !yyjson_mut_obj_add_val(result, output, "linhas", rows)) {
        fail(&r, TOM_MEMORY, "Memória insuficiente para a planilha."); goto done;
    }
    yyjson_mut_doc_set_root(result, output);
    uint32_t previous = 0; size_t row_count = 0;
    for (xmlNode *n = data->children; n && tick(&r, 40 + (int)(row_count * 50 / ROW_LIMIT)); n = n->next) {
        if (!named(n, "row")) continue;
        xmlChar *index = xmlGetProp(n, BAD_CAST "r"); uint32_t row = previous + 1;
        int valid = !index || number((char *)index, 1048576, &row); xmlFree(index);
        if (!valid || row <= previous || row > 1048576) { fail(&r, TOM_INVALID, "Linhas repetidas ou fora de ordem no XLSX."); break; }
        previous = row;
        if (++row_count > ROW_LIMIT) { fail(&r, TOM_CAPACITY, "Aba excede o limite de 50.000 linhas."); break; }
        yyjson_mut_val *record = yyjson_mut_obj(result), *cells = yyjson_mut_arr(result);
        if (!record || !cells || !yyjson_mut_obj_add_uint(result, record, "linha", row) ||
            !yyjson_mut_obj_add_val(result, record, "celulas", cells) || !yyjson_mut_arr_append(rows, record)) {
            fail(&r, TOM_MEMORY, "Memória insuficiente para a linha."); break;
        }
        uint32_t column = 0;
        for (xmlNode *c = n->children; c && tick(&r, 90); c = c->next)
            if (named(c, "c")) cell(&r, result, cells, c, row, &column, strings, count);
    }
done:
    for (size_t i = 0; i < count; i++) free(strings[i]);
    free(strings); xmlFreeDoc(worksheet); xmlFreeDoc(shared); xmlFreeDoc(bookrels); xmlFreeDoc(workbook); xmlFreeDoc(rels);
    mz_zip_reader_end(&r.zip); free(bytes);
    return r.error;
}
