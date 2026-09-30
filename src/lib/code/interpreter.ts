import type * as atype from "../analyzers/atypes";
import { codeWordStore, conventionStore } from "../stores";

let reservedWords;
codeWordStore.subscribe(value => {
   reservedWords = value;
});

// Position of a list's first element, from the convention (VCAA counts from 1)
let listStart = 1;
conventionStore.subscribe(value => {
   if (value) listStart = value.words.listStart;
});

// Turns a position written in the program into the place it is stored
function listPlace(position: unknown): number {
   const place = Number(position) - listStart;
   if (!Number.isInteger(place) || place < 0) {
      throw new Error(`List positions start at ${listStart}, so '${position}' is not a position in a list`);
   }
   return place;
}

let interpreterPrints: string;
let interpreterVariables: Array<{identifier: string, value: unknown}>;
let shouldReadInput: boolean;
let runningSentences: atype.SentencesNode[];
let lastNode: atype.SentencesNode;
let interpreterFunctions = new Map<string, atype.FunctionDefNode>();
let callDepth = 0;
const MAX_CALL_DEPTH = 1000;

export function interpreter(sentences: atype.SentencesNode[] = runningSentences): {prints: string, interruptedForInput: boolean, pendingSentences: atype.SentencesNode[], lastNode: atype.SentencesNode | undefined} {
   interpreterPrints = '';
   shouldReadInput = false;
   runningSentences = [...sentences];

   // Functions can be called before their definition, so register them all up front
   runningSentences.forEach(node => {
      if (node.name === 'FunctionDefNode') {
         interpreterFunctions.set(node.identifier, node);
      }
   });

   try {
      while (runningSentences.length) {
         const node = runningSentences.shift()!;
         lastNode = node;
         if (node.name === 'ReadNode') {
            interpreterVariables.push({
               identifier: node.identifier.value,
               value: undefined
            });
            shouldReadInput = true;
            break;
         }

         const newNode = interpretTreeNode(node);
         interpreterPrints += newNode!.print;
      }
   } catch (e) {
      interpreterPrints += 'Runtime error: ' + (e instanceof Error ? e.message : String(e)) + '<br>';
      runningSentences = [];
      shouldReadInput = false;
   }

   return {
      prints: interpreterPrints, 
      interruptedForInput: shouldReadInput,
      pendingSentences: runningSentences,
      lastNode: lastNode
   };
}

export function interpreterReset(): void {
   interpreterPrints = '';
   shouldReadInput = false;
   interpreterVariables = [];
   runningSentences = [];
   interpreterFunctions = new Map();
   callDepth = 0;
}

export function addSentence(sentence: atype.SentencesNode, index: number): void {
   runningSentences.splice(index, 0, sentence);
}

function toStoredValue(value: any): any {
   return Array.isArray(value) ? value : (isNaN(value) ? '"' + value + '"' : value);
}

function lastVariableIndex(identifier: string | undefined): number {
   for (let i = interpreterVariables.length - 1; i >= 0; i--) {
      if (interpreterVariables[i]['identifier'] === identifier) return i;
   }
   return -1;
}

// Runs a function body to completion and returns its value. Parameters and
// local declarations are pushed on top of the variables list and dropped on
// exit, so they shadow globals while the function runs.
function callFunction(call: atype.CallNode): any {
   const fn = interpreterFunctions.get(call.callee);
   if (!fn && call.callee === 'randominteger') {
      return randomInteger(call);
   }
   if (!fn && call.callee === 'randomreal') {
      return randomReal(call);
   }
   if (!fn) {
      throw new Error(`Function '${call.callee}' is not defined`);
   }
   if (fn.params.length !== call.args.length) {
      throw new Error(`Function '${call.callee}' expects ${fn.params.length} argument(s) but got ${call.args.length}`);
   }
   if (callDepth >= MAX_CALL_DEPTH) {
      throw new Error(`Too many nested calls to '${call.callee}' (limit ${MAX_CALL_DEPTH})`);
   }

   const argValues = call.args.map(arg => toStoredValue(safeEval(valueBuilder(arg))));
   const savedSentences = runningSentences;
   const savedLength = interpreterVariables.length;
   callDepth++;

   try {
      fn.params.forEach((param, index) => {
         interpreterVariables.push({ identifier: param, value: argValues[index] });
      });

      runningSentences = [...fn.body];
      while (runningSentences.length) {
         const node = runningSentences.shift()!;
         if (node.name === 'ReturnNode') {
            return node.value ? safeEval(valueBuilder(node.value)) : undefined;
         }
         interpreterPrints += interpretTreeNode(node).print;
      }
      return undefined;
   } finally {
      runningSentences = savedSentences;
      interpreterVariables.length = savedLength;
      callDepth--;
   }
}

function randomInteger(call: atype.CallNode): number {
   if (call.args.length !== 2) {
      throw new Error(`Function 'randominteger' expects 2 argument(s) but got ${call.args.length}`);
   }
   const [a, b] = call.args.map(arg => Number(safeEval(valueBuilder(arg))));
   if (isNaN(a) || isNaN(b)) {
      throw new Error(`randominteger needs two numbers`);
   }
   const low = Math.ceil(Math.min(a, b));
   const high = Math.floor(Math.max(a, b));
   if (low > high) {
      throw new Error(`randominteger has no whole number between ${a} and ${b}`);
   }
   return low + Math.floor(Math.random() * (high - low + 1));
}

// A real number in [low, high): the lower bound can come up, the upper bound never does
function randomReal(call: atype.CallNode): number {
   if (call.args.length !== 2) {
      throw new Error(`Function 'randomreal' expects 2 argument(s) but got ${call.args.length}`);
   }
   const [low, high] = call.args.map(arg => Number(safeEval(valueBuilder(arg))));
   if (isNaN(low) || isNaN(high)) {
      throw new Error(`randomreal needs two numbers`);
   }
   if (low >= high) {
      throw new Error(`randomreal needs a lower bound below the upper bound, but got ${low} and ${high}`);
   }
   return low + Math.random() * (high - low);
}

function literalFromValue(value: any): string {
   if (Array.isArray(value)) return JSON.stringify(value);
   if (typeof value === 'string') return '"' + value + '"';
   if (typeof value === 'number') return '(' + value + ')';
   return String(value);
}

function interpretTreeNode(node: atype.SentencesNode): {print: string} {
   if (node.name === 'DeclarationNode') {
      const builtValue = valueBuilder(node.value);
      const value = safeEval(builtValue);
      interpreterVariables.push({
         identifier: node.identifier,
         value: Array.isArray(value) ? value : (isNaN(value) ? '"' + value + '"' : value)
      });

      return { print: '' };
   }
   else if (node.name === 'AssignmentNode') {
      // Evaluate once, then assign to the innermost variable with that name
      if (node.identifier.name === 'ArrayIndexNode') {
         const arrayName = node.identifier.array.value;
         const index = safeEval(valueBuilder(node.identifier.index));
         const storedValue = toStoredValue(safeEval(valueBuilder(node.value)));

         if (lastVariableIndex(arrayName) < 0 && node.implicitDeclare) {
            interpreterVariables.push({ identifier: arrayName, value: [] });
         }
         const i = lastVariableIndex(arrayName);
         if (i >= 0) {
            let arr = interpreterVariables[i]['value'];
            if (!Array.isArray(arr)) {
               interpreterVariables[i]['value'] = [];
               arr = interpreterVariables[i]['value'];
            }
            arr[listPlace(index)] = storedValue;
         }
      } else {
         const storedValue = toStoredValue(safeEval(valueBuilder(node.value)));
         const i = lastVariableIndex(node.identifier.value);
         if (i >= 0) {
            interpreterVariables[i]['value'] = storedValue;
         }
         else if (node.implicitDeclare) {
            interpreterVariables.push({ identifier: node.identifier.value, value: storedValue });
         }
      }

      return { print: '' };
   }
   else if (node.name === 'PrintNode') {
      return { 
         print: safeEval(valueBuilder(node.value)) + '<br>' 
      };
   }
   else if (node.name === 'IfNode') {
      const isTrueStatement = safeEval(valueBuilder(node.argument));

      if (isTrueStatement) {
         [...node.body].reverse().forEach(bodyNode => {
            addSentence(bodyNode, 0);
         });
      }
      else {
         [...node.alternative].reverse().forEach(bodyNode => {
            addSentence(bodyNode, 0);
         });
      }
      
      return { print: '' };
   }
   else if (node.name === 'SwitchNode') {
      const switchValue = safeEval(valueBuilder(node.argument));

      node.cases.forEach(caseElement => {
         const caseValue = safeEval(valueBuilder(caseElement.argument));

         if (switchValue === caseValue) {
            [...caseElement.body].reverse().forEach(bodyNode => {
               addSentence(bodyNode, 0);
            });
         }
      });

      return { print: '' };
   }
   else if (node.name === 'RepeatNode') {
      const declarationValue = safeEval(valueBuilder(node.declaration.value));
      const toValue = safeEval(valueBuilder(node.to));
      let stepsValue = safeEval(valueBuilder(node.steps));

      // 'for i from a to b' runs zero times when b is already past a
      if (node.countUp) {
         if (stepsValue === 0) {
            throw new Error(`The step of the for loop over '${node.declaration.identifier}' cannot be 0`);
         }
         if (stepsValue > 0 ? declarationValue > toValue : declarationValue < toValue) {
            return { print: '' };
         }
      }
      stepsValue = Math.abs(stepsValue);

      const ascending = declarationValue <= toValue;
      const nextValue = ascending ? declarationValue + stepsValue : declarationValue - stepsValue;

      if (ascending ? nextValue <= toValue : nextValue >= toValue) {
         addSentence({
            body: node.body,
            declaration: {
               name: 'DeclarationNode',
               identifier: node.declaration.identifier,
               value: {
                  name: 'NumericNode',
                  value: nextValue
               } as any
            },
            name: node.name,
            steps: node.steps,
            to: node.to,
            countUp: node.countUp
         } as atype.RepeatNode, 0);
      }
       
      [...node.body].reverse().forEach(bodyNode => {
         addSentence(bodyNode, 0);
      });

      addSentence({
         name: 'DeclarationNode',
         identifier: node.declaration.identifier,
         value: {
            name: 'NumericNode',
            value: declarationValue
         }
      } as atype.DeclarationNode, 0);

      return { print: '' };
   }
   else if (node.name === 'WhileNode') {
      const argumentValue = safeEval(valueBuilder(node.argument));

      if (argumentValue) {
         addSentence({
            argument: node.argument,
            body: node.body,
            name: node.name
         } as atype.WhileNode, 0);
   
         [...node.body].reverse().forEach(bodyNode => {
            addSentence(bodyNode, 0);
         });
      }

      return { print: '' };
   }
   else if (node.name === 'DowhileNode') {
      const argumentValue = safeEval(valueBuilder(node.argument));

      if (argumentValue || node.do) {
         addSentence({
            argument: node.argument,
            body: node.body,
            name: node.name,
            do: false
         } as atype.DowhileNode, 0);
   
         [...node.body].reverse().forEach(bodyNode => {
            addSentence(bodyNode, 0);
         });
      }

      return { print: '' };
   }
   else if (node.name === 'CallStatementNode') {
      callFunction(node.call);
      return { print: '' };
   }
   else if (node.name === 'AppendNode') {
      const i = lastVariableIndex(node.list.value);
      if (i < 0 || !Array.isArray(interpreterVariables[i]['value'])) {
         throw new Error(`Cannot append to '${node.list.value}' because it is not a list`);
      }
      // The raw value is kept, so strings are not quoted twice when the list is printed
      (interpreterVariables[i]['value'] as unknown[]).push(safeEval(valueBuilder(node.value)));
      return { print: '' };
   }
   else if (node.name === 'OpenFileNode' || node.name === 'CloseFileNode') {
      throw new Error(FILES_NOT_SUPPORTED);
   }

   // FunctionDefNode is registered up front and does nothing when reached
   return { print: '' };
}

const FILES_NOT_SUPPORTED = 'Files cannot be opened or read when a program runs in PseudoFlow. The code is checked and charted, but not run.';

function groupBuilder(groupNode: atype.GroupNode, enableVariables: boolean = true): string {
   let groupExpression = '(';

   if (groupNode.body.name === 'ExpressionNode') {
      groupExpression += expressionBuilder(groupNode.body, enableVariables);
   }
   else {
      groupExpression += valueBuilder(groupNode.body, enableVariables);
   }

   return groupExpression += ')';
}

// Nested expressions are bracketed when evaluating, so the tree's grouping is kept
// (2 * -3 and 2 ^ -1 would otherwise be flattened into 2*0-3 and 2^0-1)
function operandBuilder(operand: atype.Node, enableVariables: boolean): string {
   if (operand.name === 'GroupNode') {
      return groupBuilder(operand, enableVariables);
   }
   if (operand.name === 'ExpressionNode') {
      const inner = expressionBuilder(operand, enableVariables);
      return enableVariables ? '(' + inner + ')' : inner;
   }
   return valueBuilder(operand, enableVariables) as string;
}

function expressionBuilder(node: atype.ExpressionNode, enableVariables: boolean = true): string {
   let expression = operandBuilder(node.left, enableVariables);

   if (node.operator.name === 'BooleanToken') {
      const isAnd = node.operator.value === 'and' || node.operator.value === 'y';
      expression += isAnd ? ' && ' : ' || ';
   } else {
      expression += node.operator.value;
   }

   expression += operandBuilder(node.right, enableVariables);

   return expression;
}

function safeEval(expression: any): any {
   if (typeof expression !== 'string') return expression;
   const trimmed = expression.trim();
   if (trimmed === '') return '';
   const tokens = tokenize(trimmed);
   let pos = 0;
   return parseExpression();
   function peek() { return tokens[pos]; }
   function consume() { return tokens[pos++]; }
   function expect(type: string, value?: string) {
      const t = peek();
      if (!t || t.type !== type || (value !== undefined && t.value !== value)) {
         throw new Error(`Expected ${value || type} but got ${t?.type}:${t?.value}`);
      }
      return consume();
   }
   function parseExpression(): any {
      let left = parseOr();
      return left;
   }
   function parseOr(): any {
      let left = parseAnd();
      while (peek()?.type === 'operator' && peek()?.value === '||') {
         consume();
         let right = parseAnd();
         left = left || right;
      }
      return left;
   }
   function parseAnd(): any {
      let left = parseComparison();
      while (peek()?.type === 'operator' && peek()?.value === '&&') {
         consume();
         let right = parseComparison();
         left = left && right;
      }
      return left;
   }
   function parseComparison(): any {
      let left = parseAdditive();
      if (peek()?.type === 'operator' && ['==', '!=', '>', '>=', '<', '<='].includes(peek().value)) {
         let op = consume().value;
         let right = parseAdditive();
         switch (op) {
            case '==': return left == right;
            case '!=': return left != right;
            case '>':  return left > right;
            case '>=': return left >= right;
            case '<':  return left < right;
            case '<=': return left <= right;
         }
      }
      return left;
   }
   function parseAdditive(): any {
      let left = parseMultiplicative();
      while (peek()?.type === 'operator' && (peek()?.value === '+' || peek()?.value === '-')) {
         let op = consume().value;
         let right = parseMultiplicative();
         if (op === '+') left = left + right;
         else left = left - right;
      }
      return left;
   }
   function parseMultiplicative(): any {
      let left = parseUnary();
      while (peek()?.type === 'operator' && ['*', '/', '%'].includes(peek()?.value)) {
         let op = consume().value;
         let right = parseUnary();
         switch (op) {
            case '*': left = left * right; break;
            case '/': left = left / right; break;
            case '%': left = left % right; break;
         }
      }
      return left;
   }
   function parseUnary(): any {
      if (peek()?.type === 'operator' && peek()?.value === '!') {
         consume();
         return !parseUnary();
      }
      if (peek()?.type === 'operator' && peek()?.value === '-') {
         consume();
         return -parseUnary();
      }
      if (peek()?.type === 'operator' && peek()?.value === '+') {
         consume();
         return parseUnary();
      }
      return parsePower();
   }
   function parsePower(): any {
      const base = parsePostfix();
      if (peek()?.type === 'operator' && peek()?.value === '^') {
         consume();
         const exponent = parseUnary(); // right associative, allows 2^-1
         return Math.pow(base, exponent);
      }
      return base;
   }
   function parsePostfix(): any {
      let value = parsePrimary();
      while (peek()?.type === 'dot' || peek()?.type === 'bracketOpen') {
         if (peek()?.type === 'dot') {
            consume();
            let prop = expect('identifier').value;
            if (Array.isArray(value)) {
               if (prop === 'length') value = value.length;
               else value = undefined;
            } else if (typeof value === 'string') {
               if (prop === 'length') value = value.length;
               else value = undefined;
            } else if (value && typeof value === 'object') {
               value = (value as any)[prop];
            } else {
               value = undefined;
            }
         } else if (peek()?.type === 'bracketOpen') {
            consume();
            let index = parseExpression();
            expect('bracketClose');
            if (Array.isArray(value)) {
               value = value[listPlace(index)];
            } else if (typeof value === 'string') {
               value = value[listPlace(index)];
            } else {
               value = undefined;
            }
         }
      }
      return value;
   }
   function parsePrimary(): any {
      let t = peek();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.type === 'number') {
         consume();
         return parseFloat(t.value);
      }
      if (t.type === 'string') {
         consume();
         return t.value;
      }
      if (t.type === 'identifier') {
         consume();
         if (t.value === 'true') return true;
         if (t.value === 'false') return false;
         if (t.value === 'undefined') return undefined;
         if (t.value === 'null') return null;
         throw new Error(`Unexpected identifier: ${t.value}`);
      }
      if (t.type === 'parenOpen') {
         consume();
         let value = parseExpression();
         expect('parenClose');
         return value;
      }
      if (t.type === 'bracketOpen') {
         return parseArray();
      }
      if (t.type === 'braceOpen') {
         return parseObject();
      }
      throw new Error(`Unexpected token: ${t.type}:${t.value}`);
   }
   function parseArray(): any[] {
      consume(); // '['
      let arr: any[] = [];
      if (peek()?.type === 'bracketClose') {
         consume();
         return arr;
      }
      arr.push(parseExpression());
      while (peek()?.type === 'comma') {
         consume();
         arr.push(parseExpression());
      }
      expect('bracketClose');
      return arr;
   }
   function parseObject(): any {
      consume(); // '{'
      let obj: any = {};
      if (peek()?.type === 'braceClose') {
         consume();
         return obj;
      }
      while (true) {
         let key: string;
         if (peek()?.type === 'string') {
            key = consume().value;
         } else if (peek()?.type === 'identifier') {
            key = consume().value;
         } else {
            throw new Error('Expected object key');
         }
         expect('colon');
         obj[key] = parseExpression();
         if (peek()?.type === 'comma') {
            consume();
            continue;
         }
         break;
      }
      expect('braceClose');
      return obj;
   }
}

function tokenize(expr: string): { type: string; value: string }[] {
   const tokens: { type: string; value: string }[] = [];
   let i = 0;
   while (i < expr.length) {
      if (expr[i] === ' ' || expr[i] === '\t' || expr[i] === '\n') { i++; continue; }
      if (expr[i] === '(') { tokens.push({ type: 'parenOpen', value: '(' }); i++; continue; }
      if (expr[i] === ')') { tokens.push({ type: 'parenClose', value: ')' }); i++; continue; }
      if (expr[i] === '[') { tokens.push({ type: 'bracketOpen', value: '[' }); i++; continue; }
      if (expr[i] === ']') { tokens.push({ type: 'bracketClose', value: ']' }); i++; continue; }
      if (expr[i] === '{') { tokens.push({ type: 'braceOpen', value: '{' }); i++; continue; }
      if (expr[i] === '}') { tokens.push({ type: 'braceClose', value: '}' }); i++; continue; }
      if (expr[i] === ',') { tokens.push({ type: 'comma', value: ',' }); i++; continue; }
      if (expr[i] === ':') { tokens.push({ type: 'colon', value: ':' }); i++; continue; }
      if (expr[i] === '.') { tokens.push({ type: 'dot', value: '.' }); i++; continue; }
      if (expr[i] === '"' || expr[i] === "'") {
         let quote = expr[i];
         let j = i + 1;
         while (j < expr.length && expr[j] !== quote) {
            if (expr[j] === '\\') j++;
            j++;
         }
         if (j >= expr.length) throw new Error('Unterminated string');
         tokens.push({ type: 'string', value: expr.slice(i + 1, j) });
         i = j + 1;
         continue;
      }
      if (expr[i] === '&' && expr[i + 1] === '&') {
         tokens.push({ type: 'operator', value: '&&' }); i += 2; continue;
      }
      if (expr[i] === '|' && expr[i + 1] === '|') {
         tokens.push({ type: 'operator', value: '||' }); i += 2; continue;
      }
      if (expr[i] === '=' && expr[i + 1] === '=') {
         tokens.push({ type: 'operator', value: '==' }); i += 2; continue;
      }
      if (expr[i] === '!' && expr[i + 1] === '=') {
         tokens.push({ type: 'operator', value: '!=' }); i += 2; continue;
      }
      if (expr[i] === '!') {
         tokens.push({ type: 'operator', value: '!' }); i++; continue;
      }
      if (expr[i] === '>' && expr[i + 1] === '=') {
         tokens.push({ type: 'operator', value: '>=' }); i += 2; continue;
      }
      if (expr[i] === '<' && expr[i + 1] === '=') {
         tokens.push({ type: 'operator', value: '<=' }); i += 2; continue;
      }
      if ('+-*/%><=^'.includes(expr[i])) {
         tokens.push({ type: 'operator', value: expr[i] }); i++; continue;
      }
      let m2 = expr.slice(i).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
      if (m2) {
          tokens.push({ type: 'identifier', value: m2[0] }); i += m2[0].length; continue;
      }
      if (/[0-9]/.test(expr[i])) {
         let m = expr.slice(i).match(/^[0-9]+(\.[0-9]+)?/);
         tokens.push({ type: 'number', value: m![0] }); i += m![0].length; continue;
      }
      throw new Error(`Unexpected character: ${expr[i]}`);
   }
   return tokens;
}

export function valueBuilder(node: atype.Node, enableVariables: boolean = true): unknown {
   let value: any;

   if (node.name === 'IdentifierNode' && enableVariables && interpreterVariables) {
      interpreterVariables.forEach(storedVariable => {
         if (storedVariable['identifier'] === node.value) {
            value = storedVariable['value'];
            if (Array.isArray(value)) {
               value = JSON.stringify(value);
            }
         }
      });
   }
   else if (node.name === 'ArrayIndexNode' && enableVariables) {
      const arrayName = node.array.value;
      const index = safeEval(valueBuilder(node.index));
      interpreterVariables.forEach(storedVariable => {
         if (storedVariable['identifier'] === arrayName) {
            const arr = storedVariable['value'];
            if (Array.isArray(arr)) {
               value = arr[listPlace(index)];
            }
         }
      });
   }
   else if (node.name === 'ArrayIndexNode' && !enableVariables) {
      value = node.array.value + '[' + node.index.value + ']';
   }
   else if (node.name === 'PropertyAccessNode' && !enableVariables) {
      value = valueBuilder(node.object, false) + '.' + node.property;
   }
   else if (node.name === 'PropertyAccessNode') {
      value = safeEval(valueBuilder(node.object, true) + '.' + node.property);
   }
   else if (node.name === 'ArrayNode') {
      value = '[' + node.elements.map(el => valueBuilder(el, enableVariables)).join(',') + ']';
   }
   else if (node.name === 'NotNode' && !enableVariables) {
      value = reservedWords.CODE_NOT + ' ' + valueBuilder(node.value, false);
   }
   else if (node.name === 'NotNode') {
      value = '!(' + valueBuilder(node.value) + ')';
   }
   else if (node.name === 'CallNode' && !enableVariables) {
      value = node.callee + '(' + node.args.map(arg => valueBuilder(arg, false)).join(', ') + ')';
   }
   else if (node.name === 'CallNode') {
      value = literalFromValue(callFunction(node));
   }
   else if (node.name === 'FileReadNode' && !enableVariables) {
      value = 'read next ' + node.kind + ' from ' + valueBuilder(node.file, false);
   }
   else if (node.name === 'FileReadNode') {
      throw new Error(FILES_NOT_SUPPORTED);
   }
   else if (node.name === 'ExpressionNode') {
      value = expressionBuilder(node, enableVariables);
   }
   else if (node.name === 'GroupNode') {
      value = groupBuilder(node, enableVariables);
   }
   else {
      value = node.value;
   }

   return value;
}