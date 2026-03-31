/**
 * Example usage of sec.fromSetSystem(..)
 * 
 * This demonstrates how to build a lattice from a set system
 * using the subset relation as the comparison operator.
 */

import { makeDualHelpers } from '../helpers/checkHelpers';
import { createInitialLattice } from '../model/lattice';

// Example 1: Power set of {1, 2, 3}
// Creates a lattice with all subsets ordered by subset relation
const example1 = () => {
  const primaryGraph = createInitialLattice();
  
  // Create a secondary graph from a set system
  const setSystem = [
    [],           // ∅ (empty set)
    ['1'],        // {1}
    ['2'],        // {2}
    ['3'],        // {3}
    ['1', '2'],   // {1,2}
    ['1', '3'],   // {1,3}
    ['2', '3'],   // {2,3}
    ['1', '2', '3'], // {1,2,3}
  ];

  const helpers = makeDualHelpers(
    primaryGraph,
    () => helpers.sec.fromSetSystem(setSystem) // Use fromSetSystem to create secondary graph
  );

  console.log('Example 1: Power set lattice');
  console.log('Elements:', helpers.sec.getAllNodes());
  console.log('Total elements:', helpers.sec.getAllNodes().length);
  
  // Verify subset relations work
  const empty = '∅';
  const one = '{1}';
  const oneTwo = '{1,2}';
  
  console.log(`${empty} ⊆ ${one}:`, helpers.sec.leq(empty, one));
  console.log(`${one} ⊆ ${oneTwo}:`, helpers.sec.leq(one, oneTwo));
  console.log(`${oneTwo} ⊆ ${one}:`, helpers.sec.leq(oneTwo, one));
};

// Example 2: Smaller set system
const example2 = () => {
  const primaryGraph = createInitialLattice();
  
  const setSystem = [
    [],
    ['a'],
    ['b'],
    ['a', 'b'],
  ];

  const helpers = makeDualHelpers(
    primaryGraph,
    () => helpers.sec.fromSetSystem(setSystem)
  );

  console.log('\nExample 2: Power set of {a, b}');
  console.log('Elements:', helpers.sec.getAllNodes());
  
  // Verify supremum and infimum work
  const setA = '{a}';
  const setB = '{b}';
  const setAB = '{a,b}';
  
  console.log(`sup(${setA}, ${setB}) = ${helpers.sec.sup(setA, setB)}`);
  console.log(`inf(${setA}, ${setB}) = ${helpers.sec.inf(setA, setB)}`);
};

// Example 3: Divisors of 12 (viewed as a set system)
const example3 = () => {
  const primaryGraph = createInitialLattice();
  
  // Each divisor represented by its prime factorization
  const setSystem = [
    [],           // 1 = 2^0 * 3^0
    ['2'],        // 2 = 2^1 * 3^0
    ['3'],        // 3 = 2^0 * 3^1
    ['2', '3'],   // 6 = 2^1 * 3^1
    ['2', '2'],   // 4 = 2^2 * 3^0
    ['2', '2', '3'], // 12 = 2^2 * 3^1
  ];

  const helpers = makeDualHelpers(
    primaryGraph,
    () => helpers.sec.fromSetSystem(setSystem)
  );

  console.log('\nExample 3: Divisor lattice of 12 (via set system)');
  console.log('Elements:', helpers.sec.getAllNodes());
};

// Export for use in components or other modules
export { example1, example2, example3 };
