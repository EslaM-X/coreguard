import test from "node:test";
import assert from "node:assert/strict";
import { COREDAO_KILLER_VERSION, KILLER, coreGate, coreShield, coreAnchor, killerReferenceCore, killerCustomerCore, coreEcosystemMap, status } from "../../packages/coredao-killer/index.mjs";
const RULES=[{id:"VALUE_LIMIT"},{id:"RECIPIENT_ALLOWLIST"}];
test("coredao killer",()=>{assert.equal(COREDAO_KILLER_VERSION,"COREDao-KILLER/1");assert.equal(KILLER.feature,"INTENT_TO_EVIDENCE_BINDING_CORE");});
test("coreGate",()=>{const g=coreGate({agentId:"a1",payment:{destination:"G_GOOD",amount:"10"},policy:{maxAmount:100,allowedRecipients:["G_GOOD"]},rules:RULES});assert.equal(g.allowed,true);assert.equal(g.network,"core");});
test("coreShield",()=>{const s=coreShield({action:"swap",intent:{hash:"h"},policy:{rules:RULES},rules:RULES});assert.equal(s.core,true);});
test("coreAnchor",()=>{const a=coreAnchor({commitmentId:"0x1"});assert.equal(a.status,"PLAN_OK");});
test("core refs",()=>{assert.ok(killerReferenceCore().differentiators.length>=1);assert.ok(killerCustomerCore().segments.length>=1);assert.ok(coreEcosystemMap().core.includes("Core DAO")); assert.equal(status().runMode,"DRY_RUN");});
