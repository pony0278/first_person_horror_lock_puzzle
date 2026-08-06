/* 雙手：Procedural Hand Lab v3.3 移植版。
   程序化 IK，手腕跟著工具走（設計文件 §14）。 */

import * as THREE from 'three';
import { R, anim, blind, intro, pick } from '../state.js';
import { camera, pickTool, wrench } from './scene.js';

export const LAB = (() => {
  const POSITION_B64 = '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';
  const INDEX_B64 = 'zQDMAAECzQABAuUAeQDRAMUAeQDFAMQAdQDVANAAdQDQANMA8AABAN0A8ADdAPYBegDxAN8AegDfAN4A6ADyAH8A6AB/AM4AAwB8APUBAwD1AS0A5gB9AP4B5gD+AecA9ADzAPAB9ADwAcgA9gD1APQB9gD0AeMAAgCGAP0BAgD9ATQA+AADAC0A+AAtAPoA+wDmAOcA+wDnADUA/ADNAOUA/ADlAEAA/gDoAM4A/gDOAP8AAQHaANcAAQHXAHQAbQC6AJUCbQCVAgUCzwLQAQcBzwIHAYwCBQKWAr0ABQK9ABgCAgHcAN0AAgHdAAUB3wDEAAYB3wAGAQgABwHbANwABwHcAAIBCAEEAQEACAEBAN4ACgDqAOsACgDrADYACgHsAO0ACgHtAAsBDQEJAdIADQHSAOkAJQEZAS4AJQEuABEBDgD4APoADgD6ABsBHAH7ADUAHAE1ADcAHwH8AEAAHwFAAEEAJAEMACkAJAEpABABJgEdAR4BJgEeARMBCwAgASEBCwAhARUBKgAYARcBKgAXASkAGgEPAC4AGgEuABsBEAARAB4BEAAeATcAIwEiASEBIwEhAUEAKgANAP4AKgD+AP8A1gDVAHUA1gB1ACcBgQDuACkBgQApAQwBFABaARwCFAAcAkIBPwEYAEYAPwFGAEQAIQBQAV4BIQBeAVwBtQHIAWIAtQFiAHYALAEeAGABLAFgAUgAqQDRAt4CqQDeAnUCPwFEAGQBPwFkAUUByAEWAEoAyAFKAGIARAFMAGYBRAFmAUcBGgAVAGoBGgBqAWgBKgFVAW4BKgFuARkCHABGAXIBHAByAXABxAEtAXQBxAF0AcsBHQB6AXgBHQB4AR8AcAGJAMUBcAHFARwAsQKzAiMAsQIjALoBLAFIAFoBLAFaARQAUQFJAXwBUQF8AU4AQwHCAXYBQwF2AYsAqwIGAlIAqwJSAKwCwwEmAGYAwwFmABYCOwFKAVAAOwFQAIAByQLQAhUCyQIVArcAxwFoAIIBxwGCAUgBuQJtAAUCuQIFAroCLQFzABMCLQETAnQBUgGIAYYBUgGGAU0BLgERAooBLgGKAS8BUwFMAY4BUwGOAYwBUQFOAA8CUQEPAjcBIgAgAJIBIgCSAc0BRQFkAXIBRQFyAUYBMgGWAYMAMgGDAJEAGQCaAZgBGQCYAUsBOQE2AZwBOQGcAQ0CEwByAAsCEwALAgMCVAGUAV4BVAFeAVABHgBHAWYBHgBmAWABQAFVAFMAQAFTAEEBkgA1AZ4BkgCeAQkCMQHEAcsBMQHLAaABVQFPAaIBVQGiAW4BUwGMAQcCUwEHAjoBPgEhAFwBPgFcAVkASQFIAYIBSQGCAXwBxwGkAVsAxwFbAGgAFQAwAaUBFQClAWoBTgE9AV0ATgFdAKcBOwGAAUYAOwFGABgA2gDWACcB2gAnAdcAFgAxAaABFgCgAUoASgEfAHgBSgF4AVAAuQETAAMCuQEDAs8BwwLEAiUAwwIlALkBIgDNAVsAIgBbAKQBTAFLAZgBTAGYAY4BGQAXAKkBGQCpAZoBGwBYAYQBGwCEAVcBKwFsAW8AKwFvAI4AIABNAYYBIACGAZIBPQE8AX4BPQF+AV0AkwBXAPsBkwD7ATQBPgFZAKkBPgGpARcAOAGQAWsAOAFrAJAAJgAvAYoBJgCKAWYAyAG1AdUByAHVARYATwKZAIcATwKHAEoCPAFCAIAAPAGAAMMBQQEuAf8BQQH/AdEBxAHnAdQBxAHUAS0BtwGxAekBtwHpARMAsgHzAasBsgGrAawBrQGzAfkBrQH5ATsAGADSAewBGADsAdcB2AGkAdYB2AHWAfIBFwA9APgBFwD4AdkBpQCoAJgApQCYAD4CnwBfAjoAnwA6ADcCKALZAisCKAIrAlMCxwHaAdYBxwHWAaQBGQA+AD0AGQA9ABcAPQHbAUIAPQFCADwBPwHcAdIBPwHSARgArAJSAG0ArAJtALgCugIFAhgCugIYAp4CxAKlArgBxAK4ASUAqwK3ABUCqwIVAgYCrQEjAN0BrQHdAdEBJQC4AasBJQCrAbcBuQElALcBuQG3ARMAVQHgAeQBVQHkAU8BrAEkALoBrAG6ATsAtAEnAL0BtAG9ATwAvAG+Aa8BvAGvAa4BJgC/AUMAJgBDAC8BLQHTAXMAUQEyAOIBUQHiAUkBSAEzANoBSAHaAccBSwE/AD4ASwE+ABkATgHlAdsBTgHbAT0BHADeASwAHAAsAEYBUwHfAeMBUwHjAUwBRwEeAOEBRwHhASwAPwFFAeEBPwHhAdwBSgEzAOIBSgHiAR8AIAA/AOMBIADjAU0BIQDlAeQBIQDkAVABVgFiAaUBVgGlATABDwEQASkADwEpABcBxAExAeYBxAHmAecBuwErAOgBuwHoAbABcgATAOoBcgDqASECKwAbAFcBKwBXAegB3AHhAR4A3AEeACwBLADhAUUBLABFAUYB3gFEAUcB3gFHASwA0gHcASwB0gEsARQApwBYAlECpwBRAmsC0gEUAEIB0gFCAewBwgHAAe0BwgHtAXYBDAEpASgBDAEoAQkAGAEqAP8AGAH/AMoADQAqACkADQApAAwAyQDIAPAByQDwAQ4BygD/AM4AygDOAMsAsACYAggBsAAIAQgAzgB/AH4AzgB+AMsAMwBIAUkBMwBJAeIBMwBKATsBMwA7AdoBMgAdAB8AMgAfAOIBvgG7AbABvgGwAa8BuAEkAKwBuAGsAasBpgKyAroBpgK6ASQA1gHaATsB1gE7ARgAUgJNAkYCUgJGAlkC8gHWARgA8gEYANcBqwHzAbEBqwGxAbcBNgGPAGoANgFqAJwBpAKmAiQApAIkALgBGwEuABkBGwEZAQ4AGwH6APkAGwH5ABoBEQEuAA8AEQEPABIBCwHtAO4ACwHuAIEABAEFAd0ABAHdAAEAUgCuALsAUgC7AG0A+QD6AC0A+QAtAOgA5ADjAPQB5AD0AYgALQD1AfIALQDyAOgAPwBLAUwBPwBMAeMB3AD2Ad0A3wFSAU0B3wFNAeMBPwAgACIAPwAiAD4AvQG8Aa4BvQGuATwAOwC6ASMAOwAjAK0BwwK5Ac8BwwLPAc4CPgAiAKQBPgCkAT0AJwLXAiUCJwIlApoAPQCkAdgBPQDYAfgBOwD5AbIBOwCyAawBNQEzAfoBNQH6AZ4BIwCzAr8AIwC/AN0BNwAeAR0BNwAdARwBEwEeAREAEwERABQBNwA1AAQANwAEABAANgDrAOwANgDsAAoBCAAIAd4ACADeAN8AggKvAAgAggIIAAYBNQDnAAMANQADAAQA4gA0AP0B4gD9AYUA5wD+AXwA5wB8AAMAegDeAAEAegABAPAA5QFOAU8B5QFPAeQB4AFUAVAB4AFQAeQB5QEhAD4B5QE+AdsBvwEnALQBvwG0AUMA0QHdAUAB0QFAAUEBnQLCAFUAnQJVAEAB2wE+ARcA2wEXAEIA0QH/AbMB0QGzAa0BQgAXANkBQgDZAYAAKAIqAtQCKALUAtkCMgGNAG4AMgFuAJYB3QG+AJ0C3QGdAkABQQAhASABQQAgAR8BFQEhASIBFQEiARYBQQBAAP0AQQD9ACMBDQHpAOoADQHqAAoAAwEGAcQAAwHEAMUAwwCEAgMBwwADAVYAQADlAOYAQADmAP0A8QB5AMQA8QDEAN8A5QABAn0A5QB9AOYA4QDgAAIC4QACAvcAgwKCAgYBgwIGAQMBlwFwAOAAlwHgAOEA/AE0AOIA/AHiAJ8BAgA0APwBAgD8AVgAkwKRAgUBkwIFAQQBnQFsAOMAnQHjAOQAdwHvAcgAdwHIAMkAiwHSAAkBiwEJAWcAqAEfASABqAEgAaMBbACRAfYAbAD2AOMAqgFaAP0AqgH9AOYAfwHNAPwAfwH8AF4AkwGHAREAkwERABAAcABtAccAcADHAOAAhQFZAQkAhQEJACgBqgHmAPsAqgH7AJsBmQEcAR0BmQEdAY8BXADOAQQAXAAEAAMAjgICAQUBjgIFAZICBALbAAcBBAIHAdABUQB5AQ8AUQAPABoBMQEWANUBMQHVAeYBpgFjAdgApgHYABIARwCBAfkARwD5AOgAXgD8AB8BXgAfAagBawGmARIAawESANkAXAADAPgAXAD4AGkAgwEOABkBgwEZAX0BWgBdASMBWgAjAf0ACAKNASYBCAImAYYAbwGjASABbwEgAQsACgKfAeIACgLiAIUAzgGTARAAzgEQAAQAVgADAcUAVgDFAFQAYQFnARcBYQEXARgBlQEWASIBlQEiAV8BBAIMAh4CBAIeAtsADgKdAeQADgLkAIgAGAK8AH4CGAJ+AsAAmwH7ABwBmwEcAZkBhACXAeEAhADhAPcAZQENAAwAZQEMAHMBEAJPACUBEAIlAfUAEgLRANIAEgLSAIsBjQGPAR0BjQEdASYBigBxASQBigAkAfMAiQEUAREAiQERAIcBdQEUAs8AdQHPANAAlwKTAgQBlwIEAQgBaQD4AA4AaQAOAIMBSwChAdYASwDWANoABgK5AK4ABgKuAFIAgQFRABoBgQEaAfkAFwJnAAkBFwIJAcwAiwIHAQIBiwICAY0CjAB3AckAjADJAA4BTwB9ARkBTwAZASUBSQDKAMsASQDLAFsBsgCfAhgCsgAYAsEAewESAQ8AewEPAHkBZQD0AMgAZQDIAO8BdQHQANUAdQHVAMwBcQFzAQwAcQEMACQBGgJvAQsAGgILAMYAaQFrAdkAaQHZANQATQAPARcBTQAXAWcBSwDaAAEBSwABAWMARQD+AA0ARQANAGUBfAKqAHECfAJxAnoCSQBhARgBSQAYAcoAdwBjAAEBdwABAXQAXQFfASIBXQEiASMBRwDoAP4ARwD+AEUAHQJbAcsAHQLLAH4A9gEiAh8C9gEfAu4A7wAfAiIC7wAiAngA1AEhAtMB1AHTAS0BKAHPABQCKAEUAoUBKQFxAM8AKQHPACgBKABXAXMAKABzANMB0wDQAHsA0wB7ACAChAETAnMAhAFzAFcBGgByACECGgAhAtQB1AAeAgwC1AAMAmkBaAELAnIAaAFyABoA1ADTACAC1AAgAh4CHgIgAngAHgJ4ANsAdwB0AAABdwAAAcoBIQLqASgAIQIoANMB5wHmATAB5wEwARUA1wAnARIA1wASANgAtQG2AVYBtQFWAdUB1AHnARUA1AEVABoAtgG1AXYAtgF2AMkBEgAnAXUAEgB1ANkAdADXANgAdADYAAAB7ADwAPYB7AD2Ae0A2QB1ANMA2QDTANQArwGwAbEBrwGxAfMBrgGvAfMBrgHzAbIBtAGzAf8BtAH/AUMAQwD/AS4BQwAuAS8BPACuAbIBPACyAfkBtAE8APkBtAH5AbMBQQFTABECQQERAi4BVADFANEAVADRABIC6gDpAHkA6gB5APEA6wB6APAA6wDwAOwA6gDxAHoA6gB6AOsADAF/APIADAHyAIEA6QDSANEA6QDRAHkA7gAfAnEA7gBxACkB3ADbAHgA3AB4ACICcQB7ANAAcQDQAM8AIAJ7AO8AIALvAHgA7gDtAPYB9gHcACICHwLvAHsAHwJ7AHEAWQEdAn4AWQF+AAkAfwEXAswAfwHMAM0AAQINAQoAAQIKAH0AgADZAScAgAAnAL8B/gE2AAoB/gEKAXwA+AHYAbwB+AG8Ab0B9QELAYEA9QGBAPIA8gHXAbsB8gG7Ab4BfwAMAQkAfwAJAH4A7AFCARsA7AEbACsAJwDZAfgBJwD4Ab0BvAHYAfIBvAHyAb4BuwHXAewBuwHsASsAwwGAAL8BwwG/ASYAwwEWAn4BwwF+ATwBQgEcAlgBQgFYARsAfQAKADYAfQA2AP4BfAAKAQsBfAALAfUBzAAJAQ0BzAANAQECKADpAegBKADoAVcB6gETAOkBRAFDAYsARAGLAEwAGgLGAMcAGgLHAG0BKADqAekBhAD3ABYBhAAWAZUBAgIVARYBAgIWAfcAAAKRAFQBAAJUAeABKgEAAuABKgHgAVUBkQCDAJQBkQCUAVQBKwEqARkCKwEZAmwBxgALABUBxgAVAQICCgKFABQBCgIUAYkBCAKGAAIACAICAFgA/QETARQB/QEUAYUA9wGSAFIB9wFSAd8BOgH3Ad8BOgHfAVMBOgEHAlcAOgFXAJMAUgGSAAkCUgEJAogBhgAmARMBhgATAf0BEAL1APYAEAL2AJEBDgKIABIBDgISAXsBiAD0AREBiAARARIB8QE5AR0A8QEdADIANwHxATIANwEyAFEBHQA5AQ0CHQANAnoBNwEPApABNwGQATgB9QAlAREB9QARAfQBjAAOAQ8BjAAPAU0AigDzAPQAigD0AGUADgHwARABDgEQAQ8B6wFDAUQB6wFEAd4BHADFAesBHADrAd4BxgHFAYkAxgGJAGQA8wAkARAB8wAQAfABOAE8AtMCOAHTAjcBKwEsAtICKwHSAioBMgGRACkCMgEpAjICogA5AlUCogBVAlsCNgE5AdUCNgHVAjgCkgDWAjUCkgA1AjUBkwAjAiYCkwAmAjoBxgFHAtgCxgHYAsUBAAKCACkCAAIpApEAAAIqAdICAALSAoIA9wHaAtYC9wHWApIA9wE6ASYC9wEmAtoC8QHbAtUC8QHVAjkB8QE3AdMC8QHTAtsCwgFDAUwCwgFMAkMC6wHdAkwC6wFMAkMB6wHFAdgC6wHYAt0CLAIrAY4ALAKOADACMgIvAo0AMgKNADIBIwKTADQBIwI0ATkANQI4ADMBNQIzATUBPAI4AZAAPAKQADAAOAIvAI8AOAKPADYBRwLGAcEBRwLBAUECQwJAAsABQwLAAcIBVAKUACgCVAIoAlMCWgJRAlICWgJSAlkCmACVAFACmABQAlYCmgBOAk8CmgBPAicCUgJRAlgCUgJYApsAUAKVAFUCUAJVAlcCTwJOApcATwKXAJkAlACWACoClAAqAigCWQJGAkkCWQJJAloCowBhAkICowBCAkUCTwJKAtcCTwLXAicCZwKWAJQAZwKUAGYCVgI7Aj4CVgI+ApgAUAJXAj8CUAI/AksCXQJcAjECXQIxAjQCKgKWADMCKgIzAtQCUAJLAjsCUAI7AlYCpwCkAEQCpwBEAlgCVwJVAjkCVwI5Aj8CmwBYAkQCmwBEAtwCmQCXADYCmQA2AocAWwJVApUAWwKVAGoCUgKbANwCUgLcAk0CUwIrAi4CUwIuAlQCaQJoAl8CaQJfAp8ApwBrAmECpwBhAqMAZwJmAlwCZwJcAl0CWwJqAmACWwJgAqEAbAJjAmECbAJhAmsCqACmAGACqABgAmoCnACeAF8CnABfAmgCbQJlAlwCbQJcAmYCaQKXAE4CaQJOAmgCaQKgADYCaQI2ApcAoQBgAjEAoQAxADoCYwJIAkICYwJCAmECnQCcAJoAnQCaACUCbAJrAlECbAJRAloCpgA9AjEApgAxAGACqABqApUAqACVAJgAZwJeAjMCZwIzApYAbAJaAkkCbAJJAmICngAkAjoAngA6AF8CnABoAk4CnABOApoAZAJtAlQCZAJUAi4CZQItAjECZQIxAlwCqwDfAnECqwBxAqoAbQJmApQAbQKUAFQCAAHYAAAAAAEAAAcAYwFvAgAAYwEAANgAtgFwAnMCtgFzAlYBygEAAQcAygEHAGEAYgFWAXMCYgFzAm4CyQFfAHACyQFwArYBqgB0AnUCqgB1AqsAdQJ0AnYCdQJ2AqkAdQLeAt8CdQLfAqsAeAIbAmAAeAJgAAUAqQB2AgYAqQAGANECtgCcAp8CtgCfArIArAB3AhsCrAAbAngCfAJ7AhsCfAIbAncCrAB5AgYArAAGAHYCfAJ3AnQCfAJ0AqoAewJyAmAAewJgABsCrAB2AnQCrAB0AncCfwJ+ArwAfwK8AH0CggKDAn8CggJ/An0CigKJAq0AigKtAIcCjQKKAocCjQKHAosCkAKuALkAkAK5AI8CkwKQAo8CkwKPApECsQCVAroAsQC6AJQCsACxAJQCsACUApgCswCdAr4AswC+AJoCoQKnAqYCoQKmAqQCrAKpAqMCrAKjAqsCrgK0ArMCrgKzArECvgKBAoQCvgKEAsMAxwLCAskCxwLJArcAwAB+AoACwACAArwCwALFAsQCwALEAsMCyQLBAswCyQLMAtACxwDGAAICxwACAuAAjwK4AIgCjwKIAooCkgKPAooCkgKKAo4CxgKgAqUCxgKlAsQCqwKiAsgCqwLIArcAlAK7AK4AlAKuAJACkwKXApQCkwKUApACrQKyAqYCrQKmAqgCuAKwAqoCuAKqAqwCfQK9AJYCfQKWArEArwCCAn0CrwB9ArEAmQK/ALMCmQKzArUCugKeApsCugKbArcCtAC7AsIAtADCAJ0CsgDBAL0CsgC9ArUAywLPAowCywKMAoUCrQDQAs0CrQDNAoYCFQLQAq0AFQKtAIkCxgFkAO4BxgHuAcEBTgGnAaIBTgGiAU8BoQHMAdUAoQHVANYAsAHoAekBsAHpAbEBuQK6ArYCuQK2Aq8CvwLDAs4CvwLOAsoCBgIVAogCBgKIArgA5gHVAVYB5gFWATAB';
  const S = 6.0;
  const decode = (b64, T) => { const s = atob(b64), buf = new ArrayBuffer(s.length),
    u = new Uint8Array(buf); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return new T(buf); };
  const src = decode(POSITION_B64, Float32Array);
  const idx = decode(INDEX_B64, Uint16Array);
  const pos = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) pos[i] = src[i] * S;
  const vCount = pos.length / 3;

  const fingerDefs = {
    pinky:  { base:new THREE.Vector3(-.03893,.113,0).multiplyScalar(S), tip:new THREE.Vector3(-.04021,.177,0).multiplyScalar(S), ratios:[.42,.34,.24] },
    ring:   { base:new THREE.Vector3(-.01612,.114,0).multiplyScalar(S), tip:new THREE.Vector3(-.02010,.200,0).multiplyScalar(S), ratios:[.40,.34,.26] },
    middle: { base:new THREE.Vector3(.00426,.115,0).multiplyScalar(S),  tip:new THREE.Vector3(.00594,.209,0).multiplyScalar(S),  ratios:[.40,.34,.26] },
    index:  { base:new THREE.Vector3(.03087,.114,0).multiplyScalar(S),  tip:new THREE.Vector3(.03119,.201,0).multiplyScalar(S),  ratios:[.39,.34,.27] },
    thumb:  { base:new THREE.Vector3(.046,.074,0).multiplyScalar(S),    tip:new THREE.Vector3(.079,.128,0).multiplyScalar(S),    ratios:[.44,.34,.22] },
  };
  const palmCenterX = .006 * S;
  const fingerNames = ['pinky','ring','middle','index'];

  // 鄰接表 → 指幹連通元件標記（拓撲分類，出自 lab）
  const neighbors = Array.from({ length: vCount }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t+1], c = idx[t+2];
    neighbors[a].add(b).add(c); neighbors[b].add(a).add(c); neighbors[c].add(a).add(b);
  }
  const SHAFT_CUT_Y = .120 * S;
  const shaftLabels = new Array(vCount).fill(null);
  {
    const active = new Uint8Array(vCount), visited = new Uint8Array(vCount);
    for (let vi = 0; vi < vCount; vi++) if (pos[vi*3+1] >= SHAFT_CUT_Y) active[vi] = 1;
    for (let s0 = 0; s0 < vCount; s0++) {
      if (!active[s0] || visited[s0]) continue;
      const stack = [s0], comp = []; visited[s0] = 1;
      while (stack.length) {
        const vi = stack.pop(); comp.push(vi);
        for (const nb of neighbors[vi]) if (active[nb] && !visited[nb]) { visited[nb] = 1; stack.push(nb); }
      }
      if (comp.length < 6) continue;
      let cx = 0, cy = 0;
      for (const vi of comp) { cx += pos[vi*3]; cy += pos[vi*3+1]; }
      cx /= comp.length; cy /= comp.length;
      let label = null;
      if (cx > .055*S && cy < .145*S) label = 'thumb';
      else { let best = Infinity;
        for (const n of fingerNames) { const d = Math.abs(cx - fingerDefs[n].tip.x);
          if (d < best) { best = d; label = n; } } }
      for (const vi of comp) shaftLabels[vi] = label;
    }
  }

  const psd = (px,py,ax,ay,bx,by) => {
    const abx=bx-ax, aby=by-ay, den=abx*abx+aby*aby;
    const rawT = den ? ((px-ax)*abx+(py-ay)*aby)/den : 0;
    const t = Math.max(0, Math.min(1, rawT));
    return { d: Math.hypot(px-(ax+t*abx), py-(ay+t*aby)), rawT };
  };
  const infoFor = (x,y,z,region) => {
    if (region === 'palm') return { region };
    const def = fingerDefs[region], axis = def.tip.clone().sub(def.base), total = axis.length();
    axis.normalize();
    const perp = new THREE.Vector3(-axis.y, axis.x, 0);
    const p = new THREE.Vector3(x,y,0).sub(def.base);
    return { region, t: p.dot(axis)/total, u: p.dot(perp), z };
  };
  const vertexInfo = [];
  for (let i = 0; i < pos.length; i += 3) {
    const vi = i/3, x = pos[i], y = pos[i+1], z = pos[i+2];
    let region = shaftLabels[vi];
    if (!region) {
      const td = psd(x,y,fingerDefs.thumb.base.x,fingerDefs.thumb.base.y,fingerDefs.thumb.tip.x,fingerDefs.thumb.tip.y);
      if (td.d < .015*S && td.rawT > -.25 && td.rawT < 1.22 && x > .033*S) region = 'thumb';
    }
    if (!region && y > .102*S) {
      let best = null;
      for (const n of fingerNames) {
        const d = psd(x,y,fingerDefs[n].base.x,fingerDefs[n].base.y,fingerDefs[n].tip.x,fingerDefs[n].tip.y);
        if (d.rawT > -.22 && d.d < .015*S && (!best || d.d < best.d)) best = { n, d: d.d };
      }
      if (best) region = best.n;
    }
    vertexInfo.push(infoFor(x,y,z,region || 'palm'));
  }

  const smooth = (a,b,x) => { let t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t); };
  // 形狀固定為預設值 → rest 與權重全域共用一份
  const segmentWeights = (name, t) => {
    const def = fingerDefs[name], r1 = def.ratios[0], j1 = r1, j2 = r1 + def.ratios[1], blend = .12;
    const b1 = name==='thumb' ? 'thumb_cmc' : name+'_mcp';
    const b2 = name==='thumb' ? 'thumb_mcp' : name+'_pip';
    const b3 = name==='thumb' ? 'thumb_ip'  : name+'_dip';
    const out = {};
    const add = (b,w) => { if (w > 1e-6) out[b] = (out[b]||0)+w; };
    if (t < j1-blend) add(b1,1);
    else if (t < j1+blend) { const w=(t-(j1-blend))/(2*blend); add(b1,1-w); add(b2,w); }
    else if (t < j2-blend) add(b2,1);
    else if (t < j2+blend) { const w=(t-(j2-blend))/(2*blend); add(b2,1-w); add(b3,w); }
    else add(b3,1);
    return out;
  };
  const influences = new Array(vertexInfo.length);
  for (let vi = 0; vi < vertexInfo.length; vi++) {
    const info = vertexInfo[vi];
    if (info.region === 'palm') { influences[vi] = [{ bone:'palm', w:1 }]; continue; }
    const rootW = smooth(-.06, .16, info.t);
    const weights = { palm: 1 - rootW };
    const seg = segmentWeights(info.region, info.t);
    for (const [b,w] of Object.entries(seg)) weights[b] = (weights[b]||0) + w*rootW;
    let total = 0; for (const w of Object.values(weights)) total += w;
    influences[vi] = Object.entries(weights).filter(([,w]) => w > 1e-5)
      .map(([bone,w]) => ({ bone, w: w/total }));
  }

  return { pos, idx, vertexInfo, influences, fingerDefs, palmCenterX, fingerNames, S };
})();

/* 關節姿態表（度）。wrench / pick 為佔位版，待 lab 調校後替換 */
export const JPOSE = {
  fist:   { index:[68,92,64,0],  middle:[72,98,68,0],  ring:[75,100,70,2],  pinky:[78,102,72,5],  thumb:[48,55,36,-8] },
  side:   { index:[58,78,54,0],  middle:[61,83,58,0],  ring:[64,85,60,2],   pinky:[66,87,61,5],   thumb:[41,47,31,-7] },
  reach:  { index:[12,18,10,-4], middle:[16,22,13,0],  ring:[20,28,18,4],   pinky:[26,34,22,8],   thumb:[16,18,10,12] },
  wrench: { index:[62,88,60,0],  middle:[66,92,64,0],  ring:[70,95,66,2],   pinky:[73,98,68,5],   thumb:[40,50,45,-14] },
  pick:   { index:[38,42,28,-4], middle:[58,70,50,0],  ring:[68,85,60,3],   pinky:[72,92,66,6],   thumb:[30,34,26,6] },
};

export const labSkinMat = new THREE.MeshStandardMaterial({
  color: 0xa08a78, roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
});
export const GAME_HAND_SCALE = 0.151;   // lab 尺寸 → 真實手長約 19cm

export function createLabHand(side) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LAB.pos), 3));
  geometry.setIndex(new THREE.BufferAttribute(LAB.idx, 1));
  geometry.computeVertexNormals();

  // 獨立 rig（不掛進場景，手動更新矩陣）
  const boneMap = {}, inverseBind = {};
  const rigRoot = new THREE.Group();
  const mk = (name, parent, p, restQ) => {
    const b = new THREE.Bone(); b.name = name; b.position.copy(p);
    if (restQ) b.quaternion.copy(restQ);
    parent.add(b); boneMap[name] = b;
    b.userData.restQ = (restQ || new THREE.Quaternion()).clone();
    return b;
  };
  const root = mk('root', rigRoot, new THREE.Vector3());
  const palm = mk('palm', root, new THREE.Vector3());
  for (const n of LAB.fingerNames) {
    const def = LAB.fingerDefs[n], total = def.tip.distanceTo(def.base);
    const [r1, r2] = def.ratios;
    const meta = mk(n+'_meta', palm, def.base);
    const mcp = mk(n+'_mcp', meta, new THREE.Vector3());
    const pip = mk(n+'_pip', mcp, new THREE.Vector3(0, total*r1, 0));
    mk(n+'_dip', pip, new THREE.Vector3(0, total*r2, 0));
  }
  {
    const def = LAB.fingerDefs.thumb, total = def.tip.distanceTo(def.base);
    const dir = def.tip.clone().sub(def.base).normalize();
    const restQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
    const [r1, r2] = def.ratios;
    const cmc = mk('thumb_cmc', palm, def.base, restQ);
    const mcp = mk('thumb_mcp', cmc, new THREE.Vector3(0, total*r1, 0));
    mk('thumb_ip', mcp, new THREE.Vector3(0, total*r2, 0));
  }
  rigRoot.updateMatrixWorld(true);
  for (const [n, b] of Object.entries(boneMap)) inverseBind[n] = b.matrixWorld.clone().invert();

  const current = {}, target = {};
  for (const f of [...LAB.fingerNames, 'thumb']) {
    current[f] = { j1:0, j2:0, j3:0, splay:0 };
    target[f]  = { j1:0, j2:0, j3:0, splay:0 };
  }
  const d2r = THREE.MathUtils.degToRad;
  const setB = (n, e) => { const b = boneMap[n]; if (!b) return;
    b.quaternion.copy(b.userData.restQ).multiply(new THREE.Quaternion().setFromEuler(e)); };

  const tempV = new THREE.Vector3(), accV = new THREE.Vector3(), skinMats = {};
  function skin() {
    for (const n of LAB.fingerNames) {
      const p = current[n];
      setB(n+'_meta', new THREE.Euler(0, 0, d2r(p.splay)));
      setB(n+'_mcp', new THREE.Euler(d2r(p.j1), 0, 0));
      setB(n+'_pip', new THREE.Euler(d2r(p.j2), 0, 0));
      setB(n+'_dip', new THREE.Euler(d2r(p.j3), 0, 0));
    }
    const t = current.thumb;
    setB('thumb_cmc', new THREE.Euler(d2r(t.j1), d2r(t.splay*.45), d2r(-t.splay)));
    setB('thumb_mcp', new THREE.Euler(d2r(t.j2), 0, 0));
    setB('thumb_ip',  new THREE.Euler(d2r(t.j3), 0, 0));
    rigRoot.updateMatrixWorld(true);
    for (const [n, b] of Object.entries(boneMap))
      skinMats[n] = new THREE.Matrix4().multiplyMatrices(b.matrixWorld, inverseBind[n]);
    const out = geometry.attributes.position.array;
    for (let vi = 0; vi < LAB.vertexInfo.length; vi++) {
      const i = vi*3; accV.set(0,0,0);
      for (const inf of LAB.influences[vi]) {
        tempV.set(LAB.pos[i], LAB.pos[i+1], LAB.pos[i+2]).applyMatrix4(skinMats[inf.bone]);
        accV.addScaledVector(tempV, inf.w);
      }
      out[i] = accV.x; out[i+1] = accV.y; out[i+2] = accV.z;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  function setJoints(name) {
    const P = JPOSE[name];
    for (const f of [...LAB.fingerNames, 'thumb']) {
      const a = P[f === 'index' ? 'index' : f] || P[f];
      target[f].j1 = a[0]; target[f].j2 = a[1]; target[f].j3 = a[2]; target[f].splay = a[3];
    }
  }
  function offsetIndex(dj1, dj2) { target.index.j1 += dj1; target.index.j2 += dj2; }

  function update(dt) {
    let dirty = false;
    for (const f in current) for (const k in current[f]) {
      const before = current[f][k];
      current[f][k] = THREE.MathUtils.damp(before, target[f][k], 10, dt);
      if (Math.abs(current[f][k] - before) > 0.05) dirty = true;
    }
    if (dirty) skin();
  }
  skin();

  // 座標轉接：lab 空間（+Y 指尖、+Z 掌心）→ 遊戲手空間（-Z 指尖、-Y 掌心）
  const mesh = new THREE.Mesh(geometry, labSkinMat);
  if (side < 0) mesh.scale.x = -1;         // 左手只鏡像渲染，rig 不鏡像
  const adapter = new THREE.Group();
  {
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
    const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI);
    adapter.quaternion.multiplyQuaternions(qz, qx);
  }
  adapter.scale.setScalar(GAME_HAND_SCALE);
  adapter.userData.baseQ = adapter.quaternion.clone();
  adapter.add(mesh);

  const g = new THREE.Group();
  g.userData.side = side;
  g.add(adapter);

  // 前臂與袖口（遮手腕接縫）
  const fa = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.26, 3, 9), labSkinMat);
  fa.rotation.x = Math.PI/2 - 0.22;
  fa.position.set(0, -0.035, 0.155); g.add(fa);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.046, 0.06, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c2f34, roughness: 0.9 }));
  cuff.rotation.x = Math.PI/2 - 0.22;
  cuff.position.set(0, -0.012, 0.055); g.add(cuff);

  return { group: g, side, setJoints, offsetIndex, update, target, adapter };
}

/* 取景／手腕姿態表 — Roy 於 placement lab 調校（2026-08-05）
   run 的 pron 原值 360，改記為 0（同角），讓姿態混合走短路徑 */
export const HPOSE = {
  run:    { joints:'fist',   pron:0,   pitch:8,   yaw:-28, x:0.255, y:-0.305, z:-0.425, swing:1 },
  side:   { joints:'side',   pron:150, pitch:0,   yaw:-18, x:0.285, y:-0.180, z:-0.380, swing:0 },
  reach:  { joints:'reach',  pron:95,  pitch:11,  yaw:-6,  x:0.270, y:-0.290, z:-0.660, swing:0 },
  wrench: { joints:'wrench', pron:88,  pitch:-30, yaw:16,  x:0.075, y:-0.430, z:-0.700, swing:0 },
  pick:   { joints:'pick',   pron:96,  pitch:-16, yaw:1,   x:0.360, y:-0.295, z:-0.640, swing:0 },
  away:   { joints:'fist',   pron:150, pitch:20,  yaw:-20, x:0.480, y:-0.680, z:-0.320, swing:0 },
};

export const handR = createLabHand(+1), handL = createLabHand(-1);
camera.add(handR.group, handL.group);


/* ── 手部 debug 模式（H 開關）───────────────────────────
   開啟時：計時凍結、怪物停留、雙手鎖定在選定姿態，
   滑桿直接寫入 HPOSE（匯出即調整後的表）。 */
export const hd = { on: false, fix: { rx: 0, ry: 0, rz: 0 } };
export const $hdPose = document.getElementById('hdPose');

export const HD_FIELDS = [
  ['pron',  0, 360, 1], ['pitch', -90, 90, 1], ['yaw', -90, 90, 1],
  ['x', -0.2, 0.6, 0.005], ['y', -0.8, 0.2, 0.005], ['z', -1.0, -0.1, 0.005],
];
export const hdSliderRefs = {};
{
  const host = document.getElementById('hdSliders');
  for (const [f, a, b, st] of HD_FIELDS) {
    const row = document.createElement('div');
    row.className = 'hrow';
    row.innerHTML = `<label><span>${f}</span><b></b></label>`;
    const out = row.querySelector('b');
    const input = document.createElement('input');
    input.type = 'range'; input.min = a; input.max = b; input.step = st;
    input.oninput = () => {
      const P = HPOSE[$hdPose.value];
      P[f] = parseFloat(input.value);
      out.textContent = P[f].toFixed(st < 1 ? 3 : 0);
    };
    row.appendChild(input);
    host.appendChild(row);
    hdSliderRefs[f] = { input, out };
  }
  const aHost = document.getElementById('hdAdapter');
  for (const axis of ['rx', 'ry', 'rz']) {
    const row = document.createElement('div');
    row.className = 'hrow';
    row.innerHTML = `<label><span>${axis}</span><b>0</b></label>`;
    const out = row.querySelector('b');
    const input = document.createElement('input');
    input.type = 'range'; input.min = -180; input.max = 180; input.step = 5; input.value = 0;
    input.oninput = () => {
      hd.fix[axis] = parseFloat(input.value);
      out.textContent = hd.fix[axis];
      applyAdapterFix();
    };
    row.appendChild(input);
    aHost.appendChild(row);
  }
}
export function hdSync() {
  const P = HPOSE[$hdPose.value];
  for (const [f, , , st] of HD_FIELDS) {
    hdSliderRefs[f].input.value = P[f];
    hdSliderRefs[f].out.textContent = P[f].toFixed(st < 1 ? 3 : 0);
  }
}
$hdPose.onchange = hdSync;

export function applyAdapterFix() {
  const d2r = THREE.MathUtils.degToRad;
  const fixQ = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(d2r(hd.fix.rx), d2r(hd.fix.ry), d2r(hd.fix.rz)));
  for (const h of [handR, handL])
    h.adapter.quaternion.copy(fixQ).multiply(h.adapter.userData.baseQ);
}

document.getElementById('hdExport').onclick = () => {
  const text = 'const HPOSE = ' + JSON.stringify(HPOSE, null, 2) +
    ';\nconst ADAPTER_FIX = ' + JSON.stringify(hd.fix) + ';';
  const ta = document.getElementById('hdOut');
  ta.style.display = 'block'; ta.value = text; ta.select();
  navigator.clipboard?.writeText(text).catch(() => {});
};

export const handState = {
  R: { pron:0, pitch:8, yaw:-28, x:0.255, y:-0.305, z:-0.425, swing:1 },
  L: { pron:0, pitch:8, yaw:-28, x:0.255, y:-0.305, z:-0.425, swing:1 },
};

export function hTargets() {
  if (hd.on) return { L: $hdPose.value, R: $hdPose.value };
  if (blind()) return { L:'away', R:'away' };
  if (intro.active) {
    if (intro.phase === 'run')    return { L:'run',  R:'run' };
    if (intro.phase === 'handle') return { L:'side', R:'reach' };
    return { L:'wrench', R:'pick' };
  }
  return { L:'wrench', R:'pick' };
}

export function hPlace(hand, P, swingPhase, pressF, extra) {
  const side = hand.side;
  const d2r = THREE.MathUtils.degToRad;
  const p = swingPhase + (side > 0 ? 0 : Math.PI);
  const sw = P.swing;
  const swingZ = Math.sin(p) * 0.085 * sw;
  const swingY = (Math.abs(Math.cos(p)) * 0.03 - 0.015) * sw;
  const jx = anim.handShake > 0 ? (Math.random()-0.5)*0.012 : 0;
  const jy = anim.handShake > 0 ? (Math.random()-0.5)*0.012 : 0;
  hand.group.position.set(side*P.x + jx + (extra?.dx||0), P.y + swingY - pressF*0.035 + jy + (extra?.dy||0), P.z + swingZ);
  hand.group.rotation.set(
    d2r(-6 + P.pitch + pressF*20 + Math.sin(p)*14*sw + (extra?.dpitch||0)),
    d2r(side*(6 + P.yaw)),
    d2r(side*(P.pron - 90) + Math.sin(p+0.6)*6*side*sw),
    'YXZ'
  );
}

export function updateHands(dt) {
  const tg = hTargets();
  const k = 1 - Math.exp(-9 * dt);
  if (anim.handShake > 0) anim.handShake -= dt;

  for (const key of ['L','R']) {
    const cur = handState[key], want = HPOSE[tg[key]];
    for (const f of ['pitch','yaw','x','y','z','swing'])
      cur[f] += (want[f] - cur[f]) * k;
    const dAng = ((want.pron - cur.pron + 540) % 360) - 180;   // 最短角度路徑
    cur.pron += dAng * k;
  }
  handL.setJoints(HPOSE[tg.L].joints);
  handR.setJoints(HPOSE[tg.R].joints);

  // 撬鎖時右手：食指隨頂針行程伸展（量化三檔，避免每幀重蒙皮）
  let extraR = null;
  if (!intro.active && !blind() && !hd.on) {
    const lv = Math.round(pick.lift * 3) / 3;
    handR.offsetIndex(-lv * 20, -lv * 16);
    extraR = { dx: pickTool.position.x * 0.9, dy: lv * 0.012, dpitch: -lv * 6 };
  }
  const pressF = intro.active && intro.phase === 'handle' ? (intro.press || 0) : 0;

  handL.update(dt); handR.update(dt);
  hPlace(handR, handState.R, intro.bobPhase, pressF, extraR);
  hPlace(handL, handState.L, intro.bobPhase, 0, null);
}
