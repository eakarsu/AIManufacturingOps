const jwt=require('jsonwebtoken');
module.exports=(req,res,next)=>{
  if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)return res.status(500).json({error:'Authentication is not configured'});
  const token=req.headers.authorization?.replace(/^Bearer\s+/,'');
  if(!token)return res.status(401).json({error:'Bearer token required'});
  try{req.user=jwt.verify(token,process.env.JWT_SECRET);next();}catch(_error){res.status(401).json({error:'Invalid or expired token'});}
};
