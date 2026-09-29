import assert from 'node:assert/strict';
import { analyze } from '../src/lib/analyzers/analyze';

const source = `define gen_element():
    key ← an integer drawn uniformly at random from [0, 10^7]
return key

define gen_push():
    x ← gen_element()
return (1, x)

define gen_pop():
    return (2)

define gen_getTop():
    return (3)`;

const result = analyze(source);

assert.deepEqual(result.errors, []);
assert.equal(result.program.body.length, 4);
assert.equal(result.program.body[0].name, 'FunctionDefNode');

console.log('analyzer regression passed');
