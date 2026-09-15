"""Import a saved public Wolt assortment. Never overwrite owner edits automatically."""
import json,re,unicodedata,sys
from pathlib import Path
source=Path(sys.argv[1]); data=json.loads(source.read_text())
def slug(v):return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',v.lower().replace('ł','l')).encode('ascii','ignore').decode()).strip('-')
photos={'Filadelfia z łososiem':'filadelfia','Pomarańczowy smok':'orange-smok','Zestaw Mini Smok':'mini-smok','Double Shrimp':'double-shrimp','Pieczony set':'baked-set','Party Set':'party-set'}
items={x['id']:x for x in data['items']};products=[];categories=[];downloads=[]
for c in data['categories']:
 cid=slug(c['name']);categories.append({'id':cid,'name':c['name'],'description':c['description'],'sortOrder':len(categories)})
 for sourceId in c['item_ids']:
  x=items[sourceId]; name=x['name']; desc=x.get('description','').strip(); pslug=slug(name)
  for a,b in [('shitake','shiitake'),('Masgo','Masago'),('ogorek','ogórek'),('slodki','słodki'),('lrkko','lekko'),('kewetka','krewetka')]:desc=desc.replace(a,b)
  photo=x.get('images',[{}])[0].get('url') if x.get('images') else None
  img='/images/'+photos[name]+'-1000.webp' if name in photos else None
  if not img and photo and '/689' in photo:
   img='/images/menu/'+pslug+'.webp';downloads.append({'slug':pslug,'url':photo+'?w=800'})
  match=re.search(r'(\d+)\s*szt',desc or c['description']) or re.search(r'(\d+)\s*szt',c['description'])
  pieces=int(match[1]) if match else None
  products.append({'id':pslug,'slug':pslug,'sourceId':sourceId,'categoryId':cid,'name':name,'description':desc,'ingredients':None,'weightGrams':None,'pieces':pieces,'priceGrosz':x['price'],'allergens':None,'image':img,'sourceImage':photo,'available':True,'sourceUrl':'https://wolt.com/en/pol/szczecin-prawobrzeze/restaurant/sushi-smok','verifiedAt':'2026-09-14'})
Path('src/shop/catalog.json').write_text(json.dumps({'categories':categories,'products':products},ensure_ascii=False,indent=2)+'\n')
Path('/tmp/sushi-photo-downloads.json').write_text(json.dumps(downloads))
print(f'{len(categories)} categories, {len(products)} products, {len(downloads)} additional source photos')
