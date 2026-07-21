const test=require('node:test');
const assert=require('node:assert/strict');
const {createProviderGate}=require('./providerGate');
test('legacy provider routes are quarantined and credential gated',()=>{
  const gate=createProviderGate(['/api/ai']);
  const previous={enabled:process.env.ENABLE_LEGACY_PROVIDER_ROUTES,key:process.env.OPENROUTER_API_KEY,mode:process.env.NODE_ENV};
  const call=()=>{
    const out={statusCode:null,body:null,next:false};
    const res={status(code){out.statusCode=code;return this;},json(body){out.body=body;return out;}};
    gate({path:'/api/ai/check'},res,()=>{out.next=true;});
    return out;
  };
  try {
    delete process.env.ENABLE_LEGACY_PROVIDER_ROUTES;
    delete process.env.OPENROUTER_API_KEY;
    process.env.NODE_ENV='test';
    assert.equal(call().body.error,'PROVIDER_ROUTE_QUARANTINED');
    process.env.ENABLE_LEGACY_PROVIDER_ROUTES='true';
    assert.equal(call().body.error,'PROVIDER_CREDENTIALS_MISSING');
    process.env.OPENROUTER_API_KEY='evaluation-only';
    assert.equal(call().next,true);
    process.env.NODE_ENV='production';
    assert.equal(call().body.error,'PROVIDER_CONTRACT_UNVERIFIED');
  } finally {
    for(const [key,value] of [['ENABLE_LEGACY_PROVIDER_ROUTES',previous.enabled],['OPENROUTER_API_KEY',previous.key],['NODE_ENV',previous.mode]]) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});
