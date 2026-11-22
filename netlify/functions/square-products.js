// Shared CHIC product registry. Keep these indexes aligned with index.html.
const PRODUCT_NAMES = [
  "Polka-Dot Character",
  "Pink Character",
  "Iced Coffee Character",
  "Pink Bow Girl",
  "Pink & Brown Polka Dot",
  "Pink Zebra",
  "Silver Glitter Stars",
  "Neutral Polka Dots",
  "Pink Lace",
  "Chic Girl",
  "Neutral Zebra",
  "Pink Croissant",
  "C’est La Vie",
  "Silver Glitter Zebra",
  "Glitter Angel Wings",
  "Vanilla Fawn",
  "Midnight Martini",
  "Gems",
  "Cocoa Stripes",
  "Pink Safari",
  "That's Hot!",
  "Pink Luxe",
  "Pink Stardust",
  "Mocha Leopard",
  "Polka Dot Star"
];
const RETIRED = new Set(["Iced Coffee Character", "Pink Croissant"]);
const PRICE_CENTS = 1300;
const SQUARE_VERSION = "2026-09-16";
const normalize = value => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();

async function square(path, options={}) {
  const token=process.env.SQUARE_ACCESS_TOKEN;
  if(!token || !process.env.SQUARE_LOCATION_ID) throw new Error("Square is not configured");
  const response=await fetch("https://connect.squareup.com"+path,{
    ...options,
    headers:{Authorization:"Bearer "+token,"Square-Version":SQUARE_VERSION,
      "Content-Type":"application/json",...(options.headers||{})}
  });
  const data=await response.json();
  if(!response.ok) {console.error("Square API error",response.status,JSON.stringify(data.errors||[]));throw new Error("Square inventory is temporarily unavailable");}
  return data;
}

// Resolve Square variation IDs from merchant catalog; never guess if names collide.
async function getProducts() {
  const location=process.env.SQUARE_LOCATION_ID;
  const all=[];let cursor;
  do {
    const path="/v2/catalog/list?types=ITEM"+(cursor?"&cursor="+encodeURIComponent(cursor):"");
    const response=await square(path);
    all.push(...(response.objects||[]));cursor=response.cursor;
  } while(cursor);
  const candidates=[];
  for(const obj of all){
    if(obj.is_deleted || obj.type!=="ITEM")continue;
    const item=obj.item_data||{};
    const variations=item.variations||[];
    for(const variation of variations){
      const v=variation.item_variation_data||{};
      if(variation.is_deleted || v.track_inventory!==true)continue;
      if(variation.present_at_all_locations===false && !(variation.present_at_location_ids||[]).includes(location))continue;
      if((variation.absent_at_location_ids||[]).includes(location))continue;
      candidates.push({id:variation.id,name:item.name,variation:v.name});
    }
  }
  const list=PRODUCT_NAMES.map(name=>{
    if(RETIRED.has(name))return {name,id:null};
    const target=normalize(name);
    const matches=candidates.filter(candidate=>{
      const n=normalize(candidate.name);
      return n===target || n==="chic lash tile "+target || n==="chic "+target;
    });
    // One variation per tile required; ambiguous/missing names cannot be checked out.
    return {name,id:matches.length===1?matches[0].id:null};
  });
  return list;
}

async function inventory() {
  const catalog=await getProducts();
  const ids=catalog.map(x=>x.id).filter(Boolean);
  const counts=new Map();
  if(ids.length){
    let cursor;
    do {
      const result=await square("/v2/inventory/counts/batch-retrieve",{
        method:"POST",
        body:JSON.stringify({catalog_object_ids:ids,location_ids:[process.env.SQUARE_LOCATION_ID],
          states:["IN_STOCK"],...(cursor?{cursor}:{})})
      });
      for(const count of result.counts||[]){
        if(count.state==="IN_STOCK" && count.location_id===process.env.SQUARE_LOCATION_ID){
          counts.set(count.catalog_object_id,(counts.get(count.catalog_object_id)||0)+Number(count.quantity||0));
        }
      }
      cursor=result.cursor;
    }while(cursor);
  }
  return catalog.map((item,id)=>({id,name:item.name,variationId:item.id,
    stock:item.id?Math.max(0,Math.floor(counts.get(item.id)||0)):0,
    linked:Boolean(item.id)}));
}
module.exports={PRODUCT_NAMES,RETIRED,PRICE_CENTS,SQUARE_VERSION,square,inventory};
