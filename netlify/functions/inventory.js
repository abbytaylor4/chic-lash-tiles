const {inventory}=require("./square-products");
exports.handler=async event=>{
  if(event.httpMethod!=="GET")return {statusCode:405,body:"GET required"};
  try {
    const products=await inventory();
    return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
      body:JSON.stringify({products})};
  }catch(error){
    console.error("Inventory loading failed",error);
    return {statusCode:503,headers:{"Content-Type":"application/json","Cache-Control":"no-store"},
      body:JSON.stringify({error:"Live inventory is temporarily unavailable"})};
  }
};
