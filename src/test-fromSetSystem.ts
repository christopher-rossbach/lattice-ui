import { makeDualHelpers } from './helpers/checkHelpers';

// Test the fromSetSystem function
const testInput = [[], ['1', '2'], ['3'], ['1', '2', '3']];

console.log('Testing fromSetSystem with input:', testInput);

// Create a dummy primary graph
const primaryGraph = {
  elements: {},
  relations: []
};

// We'll use a workaround: first create the lattice without helpers,
// then manually inspect it
import { LatticeStateShape, getLayers, LatticeElement, Relation } from './model/lattice';

const setToId = (set: string[]): string => {
  const sorted = [...set].sort();
  return sorted.length === 0 ? '∅' : `{${sorted.join(',')}}`;
};

const isSubset = (setA: string[], setB: string[]): boolean => {
  return setA.every((item) => setB.includes(item));
};

const isProperSubset = (setA: string[], setB: string[]): boolean => {
  return isSubset(setA, setB) && setA.length < setB.length;
};

const hasIntermediateSubset = (setA: string[], setB: string[], allSets: string[][]): boolean => {
  return allSets.some((setC) => {
    return (
      isProperSubset(setA, setC) &&
      isProperSubset(setC, setB)
    );
  });
};

const elements: Record<string, LatticeElement> = {};
const relations: Relation[] = [];
const uniqueSets: string[][] = [];
const seenIds = new Set<string>();

// Add all sets as elements
testInput.forEach((set) => {
  const id = setToId(set);
  if (!seenIds.has(id)) {
    seenIds.add(id);
    uniqueSets.push(set);
    elements[id] = {
      id,
      rank: set.length,
      color: '#0f172a',
    };
  }
});

console.log('Elements:', Object.keys(elements).map(k => `${k} (rank ${elements[k].rank})`));
console.log('Unique sets:', uniqueSets);

// Add relations
console.log('\nChecking relations:');
for (let i = 0; i < uniqueSets.length; i++) {
  for (let j = 0; j < uniqueSets.length; j++) {
    if (i !== j) {
      const setI = uniqueSets[i];
      const setJ = uniqueSets[j];

      const isProper = isProperSubset(setI, setJ);
      const hasIntermediate = hasIntermediateSubset(setI, setJ, uniqueSets);

      console.log(
        `  ${setToId(setI)} → ${setToId(setJ)}: isProper=${isProper}, hasIntermediate=${hasIntermediate}`
      );

      if (isProper && !hasIntermediate) {
        const fromId = setToId(setI);
        const toId = setToId(setJ);
        if (!relations.some((r) => r.from === fromId && r.to === toId)) {
          relations.push({ from: fromId, to: toId });
          console.log(`    ✓ Adding edge`);
        }
      }
    }
  }
}

console.log('\nFinal relations:');
relations.forEach(r => console.log(`  ${r.from} → ${r.to}`));

console.log('\nExpected diamond structure:');
console.log('  Rank 0: ∅');
console.log('  Rank 1: {3}');
console.log('  Rank 2: {1,2}');
console.log('  Rank 3: {1,2,3}');
console.log('\nExpected edges:');
console.log('  ∅ → {3}');
console.log('  ∅ → {1,2}');
console.log('  {3} → {1,2,3}');
console.log('  {1,2} → {1,2,3}');
