import test from "node:test";
import assert from "node:assert/strict";
import { PI_KILLER_VERSION, KILLER, piGate, piShield, piAnchor, killerReferencePi, killerCustomerPi, piEcosystemMap, status } from "../../packages/pi-killer/index.mjs";
const RULES=[{id:"VALUE_LIMIT"},{id:"RECIPIENT_ALLOWLIST"}];
test("pi killer",()=>{assert.equal(PI_KILLER_VERSION,"PI-KILLER/1");assert.equal(KILLER.feature,"INTENT_TO_EVIDENCE_BINDING_PI");});
test("piGate",()=>{const g=piGate({agentId:"a1",payment:{destination:"G_GOOD",amount:"10"},policy:{maxAmount:100,allowedRecipients:["G_GOOD"]},rules:RULES});assert.equal(g.allowed,true);assert.equal(g.network,"pi");});
test("piShield",()=>{const s=piShield({action:"pay",intent:{hash:"h"},policy:{rules:RULES},rules:RULES});assert.equal(s.pi,true);});
test("piAnchor",()=>{const a=piAnchor({commitmentId:"0x1"});assert.equal(a.status,"PLAN_OK");});
test("pi refs",()=>{assert.ok(killerReferencePi().differentiators.length>=1);assert.ok(killerCustomerPi().segments.length>=1);assert.ok(piEcosystemMap().pi.includes("Pi Network")); assert.equal(status().runMode,"DRY_RUN");});
