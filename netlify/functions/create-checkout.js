const crypto=require("crypto");
const {PRODUCT_NAMES,RETIRED,PRICE_CENTS,square,inventory}=require("./square-products");
const reply=(statusCode,data)=>({statusCode,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(data)});
exports.handler=async event=>{
  if(event.httpMethod!=="POST")return reply(405,{error:"POST required"});
  let cart;
  try{cart=JSON.parse(event.body||"{}")}catch{return reply(400,{error:"Invalid cart"})}
  if(!cart||!Array.isArray(cart.items)||!cart.items.length||cart.items.length>PRODUCT_NAMES.length||
    !["shipping","pickup"].includes(cart.delivery))return reply(400,{error:"Invalid checkout details"});
  const seen=new Set();
  for(const item of cart.items){
    if(!item||!Number.isInteger(item.id)||item.id<0||item.id>=PRODUCT_NAMES.length||
      !Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100||
      seen.has(item.id)||RETIRED.has(PRODUCT_NAMES[item.id]))return reply(400,{error:"Invalid product or quantity"});
    seen.add(item.id);
  }
  try{
    const stock=await inventory();
    for(const item of cart.items){
      const p=stock[item.id];
      if(!p.linked||item.quantity>p.stock)return reply(409,{error:p.name+" is sold out or has insufficient stock. Please refresh your bag."});
    }
    let subtotal=0;
    const lineItems=cart.items.map(item=>{
      subtotal+=item.quantity*PRICE_CENTS;
      return {catalog_object_id:stock[item.id].variationId,quantity:String(item.quantity),
        base_price_money:{amount:PRICE_CENTS,currency:"USD"}};
    });
    const freeShipping=subtotal>3000;
    if(cart.delivery==="shipping"&&!freeShipping){
      lineItems.push({name:"Flat-rate shipping",quantity:"1",base_price_money:{amount:700,currency:"USD"}});
    }
    const request={idempotency_key:crypto.randomUUID(),order:{location_id:process.env.SQUARE_LOCATION_ID,line_items:lineItems},
      checkout_options:{ask_for_shipping_address:cart.delivery==="shipping",allow_tipping:false},
      payment_note:cart.delivery==="pickup"?"CHIC: Free local pickup in Salt Lake City, Utah. "+
        "Pickup contact: "+String(cart.pickupName||"").slice(0,100)+" "+String(cart.pickupPhone||"").slice(0,50):
        freeShipping?"CHIC: Free shipping on orders over $30.":"CHIC: $7 flat-rate shipping."};
    const result=await square("/v2/online-checkout/payment-links",{method:"POST",body:JSON.stringify(request)});
    if(!result.payment_link?.url)return reply(502,{error:"Square could not create checkout"});
    return reply(200,{url:result.payment_link.url});
  }catch(error){console.error("Square checkout failed",error);return reply(503,{error:"Checkout is temporarily unavailable. Please try again."});}
};
