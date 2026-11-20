// Load actual TSX/assets for server-rendered component tests without a bundler.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function component(file,mocks={}){
 const abs=path.isAbsolute(file)?file:path.join(root,file),module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(abs,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,Date,Set,Map,console,performance,setTimeout,clearTimeout,setInterval,clearInterval,require:key=>{
  if(Object.hasOwn(mocks,key))return mocks[key];
  if(key.endsWith('.module.css'))return{default:new Proxy({},{get:(_,k)=>String(k)})};
  if(key.endsWith('.png'))return{default:{src:'/test-asset.png'}};
  if(key.startsWith('.')||key.startsWith('@/')){let f=key.startsWith('@/')?path.join(root,key.slice(2)):path.resolve(path.dirname(abs),key);if(!path.extname(f))f=fs.existsSync(f+'.tsx')?f+'.tsx':f+'.ts';return component(f,mocks);}
  return require(key);
 }});return module.exports;
}
module.exports={component};
