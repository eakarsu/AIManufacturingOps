const express=require('express');
const pool=require('../db');
const auth=require('../middleware/governedAuth');
const {createWorkflow}=require('./workflowCore');
const {createGovernedRouter}=require('./routerFactory');
const db={query:async(s,p)=>(await pool.query(s,p)).rows,transaction:async work=>{const c=await pool.connect();try{await c.query('BEGIN');const result=await work(async(s,p)=>(await c.query(s,p)).rows);await c.query('COMMIT');return result;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}};
module.exports=createGovernedRouter({express,workflow:createWorkflow(require('./config')),auth,db});
