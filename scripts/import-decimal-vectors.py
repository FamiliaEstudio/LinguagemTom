import zipfile,re,shlex,decimal,json,hashlib
from pathlib import Path
archive=Path('.tools/downloads/dectest.zip')
expected_hash='b70a224cd52e82b7a8150aedac5efa2d0cb3941696fd829bdbe674f9f65c3926'
if hashlib.sha256(archive.read_bytes()).hexdigest() != expected_hash:
 raise RuntimeError('Official decimal fixture checksum mismatch')
z=zipfile.ZipFile(archive); allcases=[]
ctx=decimal.Context(prec=34,Emin=-6143,Emax=6144,rounding=decimal.ROUND_HALF_EVEN,clamp=1)
for k in ctx.traps:ctx.traps[k]=False
def normal(s):
 s=s.lstrip('+');s=re.sub(r'^(\-?)\.',r'\g<1>0.',s);s=re.sub(r'\.(?=[eE]|$)', '.0',s);return s
def valid(s):
 try:
  d=decimal.Decimal(s);q=ctx.create_decimal(s);return d.is_finite() and q.is_finite() and d==q
 except:return False
for f,op in [('dqAdd.decTest','Somar'),('dqSubtract.decTest','Subtr'),('dqMultiply.decTest','Multi'),('dqDivide.decTest','Divid')]:
 cases=[]; config={}
 for line in z.read(f).decode().splitlines():
  line=line.split('--')[0].strip()
  if not line:continue
  if ':' in line:
   a,b=line.split(':',1);config[a.strip().lower()]=b.strip();continue
  if config.get('rounding')!='half_even' or config.get('precision')!='34' or config.get('maxexponent')!='6144' or config.get('minexponent')!='-6143':continue
  v=shlex.split(line)
  if len(v)<6 or v[4]!='->':continue
  ident,_,a,b,_,expected,*flags=v;a,b,expected=map(normal,(a,b,expected))
  if not valid(a) or not valid(b):continue
  code=2 if op=='Divid' and decimal.Decimal(b).is_zero() else 1 if 'Overflow' in flags else 3 if 'Underflow' in flags else 0
  if not code and not valid(expected):continue
  cases.append(dict(id=ident,op=op,a=a,b=b,**({'error':code} if code else {'expected':expected})))
 # Spread cases across the source, retaining early confidence/tie cases and all error categories.
 selected=cases[:20]+[cases[20+i*(len(cases)-21)//43] for i in range(44)]
 for code in [1,2,3]:selected+=next(([c] for c in cases if c.get('error')==code),[])
 allcases.extend({c['id']:c for c in selected}.values())
Path('tom-lang/tests/fixtures').mkdir(exist_ok=True)
Path('tom-lang/tests/fixtures/decimal128.json').write_text(json.dumps(allcases,indent=2)+'\n')
print(len(allcases),hashlib.sha256(Path('.tools/downloads/dectest.zip').read_bytes()).hexdigest())
