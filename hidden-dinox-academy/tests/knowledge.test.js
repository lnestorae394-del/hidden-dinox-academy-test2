"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { FakeFirestore } = require("./helpers/fake-firestore");
const { fakeVerify } = require("./helpers/http");
const { adminCaller } = require("./helpers/router");
const { createAdminApi } = require("../academy/admin-api");
const { createKnowledge } = require("../academy/knowledge");
const quiet = { log(){}, warn(){}, error(){} };
function setup(){ const db=new FakeFirestore(); const A=adminCaller(createAdminApi({db,verifyIdToken:fakeVerify,log:quiet,now:()=>1800000000000})); return {db,A}; }
test("Knowledge Manager: RBAC, create draft, publish, search, version and export", async()=>{
 const {db,A}=setup(); await db.collection("users").doc("boss").set({role:"admin"}); await db.collection("users").doc("student").set({role:"student"});
 assert.equal((await A("GET","/knowledge",{uid:"student"})).statusCode,403);
 const c=await A("POST","/knowledge",{uid:"boss",body:{title:"Hidden Dinox Academy",category:"academy",language:"ru",content:"Образовательная платформа Hidden Dinox Academy",tags:["academy"],source:"approved",verified:true}});
 assert.equal(c.statusCode,200); const id=c.body.item.id; assert.equal(c.body.item.status,"draft");
 assert.equal((await A("POST",`/knowledge/${id}/publish`,{uid:"boss",body:{confirm:true,published:true}})).statusCode,200);
 const kn=createKnowledge({db}); const found=await kn.search("ru","Hidden Dinox Academy"); assert.equal(found.length,1); assert.equal(found[0].title,"Hidden Dinox Academy");
 const versions=await A("GET",`/knowledge/${id}/versions`,{uid:"boss"}); assert.ok(versions.body.versions.length>=2);
 const ex=await A("GET","/knowledge/export",{uid:"boss"}); assert.equal(ex.body.items.length,1);
});
test("Knowledge Manager: invalid schema rejected; imports are drafts",async()=>{
 const {A,db}=setup(); await db.collection("users").doc("boss").set({role:"admin"});
 assert.equal((await A("POST","/knowledge",{uid:"boss",body:{title:"bad",category:"nope",language:"ru",content:"x"}})).statusCode,400);
 const r=await A("POST","/knowledge/import",{uid:"boss",body:{confirm:true,items:[{title:"Тест",category:"academy",language:"ru",content:"Материал"}]}});
 assert.equal(r.body.imported,1); assert.equal(r.body.items[0].status,"draft");
});
test("Knowledge retrieval: semantic aliases, title/tag boosts and chunk retrieval", async()=>{
 const db=new FakeFirestore(), kn=createKnowledge({db});
 const a=await kn.create({title:"Управление риском",category:"risk-management",language:"ru",content:"Размер позиции и контроль риска помогают ограничивать потери. ".repeat(30),tags:["risk","management"]},"boss");
 const b=await kn.create({title:"Ликвидность и стопы",category:"smart-money",language:"ru",content:"Ликвидность формируется около равных максимумов и минимумов; стоп-ордера участников могут располагаться за экстремумами."},"boss");
 await kn.publish(a.id,true,"boss"); await kn.publish(b.id,true,"boss");
 const risk=await kn.search("ru","risk management",5); assert.ok(risk.some(x=>x.material_id===a.id));
 const liquidity=await kn.search("ru","liquidity",5); assert.ok(liquidity.some(x=>x.material_id===b.id));
 assert.ok(liquidity[0].score>0); assert.ok(liquidity[0].content.length>0);
});
