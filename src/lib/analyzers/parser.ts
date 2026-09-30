import type * as atype from './atypes'
import type { Convention, Phrase, PhrasePart } from '../convention/loader';
import { codeWordStore, conventionStore } from "../stores";
import { lexer } from './lexer';

let reservedWords;
codeWordStore.subscribe(value => {
   reservedWords = value;
});

let convention: Convention;
let phraseStarts = new Set<string>();
conventionStore.subscribe(value => {
   if (!value) return;
   convention = value;
   phraseStarts = new Set(value.phrases.flatMap(phrase => (phrase.parts[0] as { options: string[] }).options));
});

let parserIndex: number;
let parserTokens: Array<atype.Token>;
let insideDefine = false;

const STATEMENT_START_TOKENS = [
   'DeclarationToken', 'PrintToken', 'ReadToken', 'IdentifierToken',
   'OpenIfToken', 'OpenSwitchToken', 'OpenRepeatToken',
   'OpenWhileToken', 'OpenDowhileToken', 'DefineToken', 'ReturnToken', 'AlgorithmToken'
];

export const parser = (tokens: Array<atype.Token>): { body: atype.SentencesNode[], errors: atype.AnalysisError[] } => {
   let program = { type: 'program' as const, body: new Array<atype.SentencesNode>() }
   const errors: atype.AnalysisError[] = []
   parserTokens = tokens;
   parserIndex = 0;

    while (parserIndex + 1 < parserTokens.length) {
       const outerLine = parserTokens[parserIndex]?.line
       insideDefine = false;
       try {
           program.body.push(...parse());
          if (parserTokens[parserIndex + 1])
             parserIndex++;
       } catch (e) {
          if (e instanceof SyntaxError) {
             const errorLine = parserTokens[parserIndex]?.line ?? outerLine;
             errors.push({
                type: 'syntax',
                message: e.message,
                line: errorLine
             });
            while (parserIndex < parserTokens.length - 1) {
                parserIndex++;
                const token = parserTokens[parserIndex];
                if (isForStatement() || isCommandStatement()) break;
                if (token.name === 'IdentifierToken') {
                    const next = parserTokens[parserIndex + 1];
                    if (next && (next.name === 'AssignmentToken' || next.name === 'OpenBracketToken' || next.name === 'OpenParenToken')) break;
                    continue;
                }
                if (STATEMENT_START_TOKENS.includes(token.name)) break;
             }
         } else {
            throw e
         }
      }
   }

   return { body: program.body, errors }
};

function parse() : atype.SentencesNode[] {
   const token = parserTokens[parserIndex];

   if (token.name === 'DeclarationToken') {
      return declarationParser();
   }
   else if (isForStatement()) {
      return [forParser()];
   }
   else if (isCommandStatement()) {
      return [commandParser()];
   }
   else if (token.name === 'AlgorithmToken') {
      if (insideDefine) {
         throw new SyntaxError(`An algorithm cannot start inside a function. End the function before 'Algorithm:'.`);
      }
      return [{ name: 'AlgorithmNode', title: token.value!, line: token.line }];
   }
   else if (isHeaderLine()) {
      skipRestOfLine();
      return [];
   }
   else if (token.name === 'IdentifierToken' && parserTokens[parserIndex + 1]?.name === 'OpenParenToken') {
      return [{ name: 'CallStatementNode', call: callParser() }];
   }
   else if (token.name === 'IdentifierToken') {
      return [assignmentParser()];
   }
   else if (token.name === 'PrintToken') {
      return [printParser()];
   }
   else if (token.name === 'ReadToken') {
      if (insideDefine) {
         throw new SyntaxError(`'${token.value}' cannot be used inside a function. Pass the value as a parameter instead.`);
      }
      return readParser();
   }
   else if (token.name === 'DefineToken') {
      if (insideDefine) {
         throw new SyntaxError(`A function cannot be defined inside another function. Close it with '${reservedWords.CODE_ENDDEFINE}' first.`);
      }
      return [defineParser()];
   }
   else if (token.name === 'ReturnToken') {
      if (!insideDefine) {
         throw new SyntaxError(`'${token.value}' can only be used inside a function.`);
      }
      return [returnParser()];
   }
   else if (token.name === 'OpenIfToken') {
      return [ifParser()];
   }
   else if (token.name === 'OpenSwitchToken') {
      return [switchParser()];
   }
   else if (token.name === 'OpenRepeatToken') {
      return [repeatParser()];
   }
   else if (token.name === 'OpenWhileToken') {
      return [whileParser()];
   }
   else if (token.name === 'OpenDowhileToken') {
      return [dowhileParser()];
   }

   throw new SyntaxError(`Unexpected '${token.value || token.name}'. A statement like declare, if, while, or an identifier was expected here.`);
}

// A 'skip' heading from the convention ('Input: <text>', 'Output: <text>') describes the code
// that follows; it is read as a heading, not a statement. A 'chart' heading is its own token

function isHeaderLine(): boolean {
   const token = parserTokens[parserIndex];
   const next = parserTokens[parserIndex + 1];
   return token.name === 'IdentifierToken' && convention.headings[token.value!.toLowerCase()] === 'skip' &&
      next?.line === token.line && next.value === ':';
}

// Leaves the index on the last token of the line, as a finished statement does
function skipRestOfLine() {
   const line = parserTokens[parserIndex].line;
   while (parserTokens[parserIndex + 1]?.line === line) parserIndex++;
}

function nextIndex() {
    if (!parserTokens[parserIndex + 1])
        throw new SyntaxError('Unexpected end of code. The statement appears incomplete.');
    parserIndex++;
}

function expectOpenParen(keyword: string) {
    const token = parserTokens[parserIndex];
    const got = token.value !== undefined ? `'${token.value}'` : token.name;
    throw new SyntaxError(`Expected '(' after '${keyword}' but found ${got}.`);
}

function expectCloseParen(context: string) {
    const token = parserTokens[parserIndex];
    if (token.name === 'AssignmentToken') {
        throw new SyntaxError(`Unexpected '=' in ${context} condition. Use '==' to compare values, not '=' (assignment).`);
    }
    const got = token.value !== undefined ? `'${token.value}'` : token.name;
    throw new SyntaxError(`Missing ')' after ${context} condition, found ${got} instead.`);
}

function tokenToNode(token: atype.Token) : atype.Node {
   return {
      name: token.name.replace('Token', 'Node') as 'NumericNode' | 'StringNode' | 'IdentifierNode',
      value: token.value
   }
}

function precedenceOf(token: atype.Token): number {
   switch (token.name) {
      case 'BooleanToken':    return 1;
      case 'RelationalToken':  return 2;
      case 'AdditionToken':
      case 'SubstractionToken':
      case 'MultiplicationToken':
      case 'DivisionToken':
      case 'ModuleToken':     return 3;
      case 'PowerToken':      return 4;
      default:                 return 0;
   }
}

function atomParser(): atype.Node {
   const token = parserTokens[parserIndex];

   if (token.name === 'SubstractionToken') {
      nextIndex();
      // Takes powers along, so -x^2 is -(x^2)
      const operand = expressionParser(3);
      return {
         name: 'ExpressionNode',
         left: { name: 'NumericNode', value: '0' } as atype.NumericNode,
         right: operand,
         operator: token as atype.SubstractionToken
      };
   }

   if (token.name === 'NotToken') {
      nextIndex();
      // Binds tighter than and/or but covers comparisons: not a > b  ->  not (a > b)
      const operand = expressionParser(1);
      return { name: 'NotNode', value: operand };
   }

   if (token.name === 'ReadToken' && parserTokens[parserIndex + 1]?.value === 'next') {
      return fileReadParser();
   }

   const validStartTokens = ['NumericToken', 'StringToken', 'IdentifierToken', 'OpenParenToken', 'OpenBracketToken'];
   if (!validStartTokens.includes(token.name)) {
      throw new SyntaxError('Expected a value');
   }

   // Phrases written in words, from the convention: 'random integer from 1 to 6', 'empty list', ...
   if (token.name === 'IdentifierToken' && phraseStarts.has(token.value!)) {
      const phrase = phraseParser();
      if (phrase) return phrase;
   }

   if (token.name === 'OpenParenToken') {
      nextIndex();
      const inner = expressionParser(0);
      // A comma makes a tuple, kept as a list: (1, key)
      if (convention.words.bracketTuples && parserTokens[parserIndex + 1]?.name === 'CommaToken') {
         const elements = [inner];
         while (parserTokens[parserIndex + 1]?.name === 'CommaToken') {
            nextIndex();
            nextIndex();
            elements.push(expressionParser(0));
         }
         nextIndex();
         if (parserTokens[parserIndex].name !== 'CloseParenToken') {
            throw new SyntaxError("Missing ')' after the values in brackets.");
         }
         return { name: 'ArrayNode', elements };
      }
      nextIndex();
      if (parserTokens[parserIndex].name === 'AssignmentToken') {
         throw new SyntaxError("Unexpected '=' in a condition. Use '==' to compare values, not '=' (assignment).");
      }
      if (parserTokens[parserIndex].name !== 'CloseParenToken') {
         throw new SyntaxError("Missing ')' after expression.");
      }
      return { name: 'GroupNode', body: inner };
   }
   else if (token.name === 'OpenBracketToken') {
      return arrayParser();
   }
   else if (
      token.name === 'IdentifierToken' &&
      parserTokens[parserIndex + 1]?.name === 'OpenBracketToken'
   ) {
      return arrayIndexParser();
   }
   else if (
      token.name === 'IdentifierToken' &&
      parserTokens[parserIndex + 1]?.name === 'OpenParenToken'
   ) {
      return callParser();
   }

   return tokenToNode(token);
}

// VCAA uses the letter x as a times sign: 'product x i'. It only counts as one when it
// sits between two values on the same line, where a variable could not appear.
function isLetterTimes(index: number): boolean {
   const letter = parserTokens[index];
   const before = parserTokens[index - 1];
   const after = parserTokens[index + 1];
   const valueStarts = ['NumericToken', 'IdentifierToken', 'OpenParenToken', 'OpenBracketToken', 'SubstractionToken'];
   return convention.words.letterTimes !== false &&
      letter?.name === 'IdentifierToken' && letter.value === convention.words.letterTimes &&
      before?.line === letter.line &&
      after?.line === letter.line && valueStarts.includes(after.name);
}

function expressionParser(minPrecedence: number = 0): atype.Node {
   let left = atomParser();

   if (parserTokens[parserIndex + 1]?.name === 'DotToken') {
      nextIndex();
      nextIndex();
      const property = parserTokens[parserIndex] as atype.IdentifierToken;
      let propertyName = property.value!;
      if (reservedWords.CODE_LENGTH && propertyName === reservedWords.CODE_LENGTH) {
         propertyName = 'length';
      }
      left = { name: 'PropertyAccessNode', object: left, property: propertyName };
   }

   while (true) {
      if (isLetterTimes(parserIndex + 1)) {
         const letter = parserTokens[parserIndex + 1];
         parserTokens[parserIndex + 1] = { name: 'MultiplicationToken', value: '*', line: letter.line, indent: letter.indent };
      }
      const nextToken = parserTokens[parserIndex + 1];
      if (!nextToken) break;
      const prec = precedenceOf(nextToken);
      if (prec === 0 || prec <= minPrecedence) break;
      nextIndex();
      const operator = parserTokens[parserIndex] as atype.OperatorToken;
      nextIndex();
      // '^' is right associative: 2^3^2 = 2^(3^2)
      const right = expressionParser(operator.name === 'PowerToken' ? prec - 1 : prec);
      left = { name: 'ExpressionNode', left, right, operator };
   }

   return left;
}


function declarationParser() : atype.DeclarationNode[] {
   const declarations: atype.DeclarationNode[] = [];

   while (true) {
      nextIndex();
      const identifier = parserTokens[parserIndex];
      let value: any;
      let autoFlag = false;
      if (parserTokens[parserIndex+1] && parserTokens[parserIndex+1].name === 'AssignmentToken') {
         nextIndex();
         nextIndex();
         value = expressionParser();
      }
      else if (parserTokens[parserIndex+1] && parserTokens[parserIndex+1].name === 'RelationalToken' && parserTokens[parserIndex+1].value === '==') {
         throw new SyntaxError(`Expected '=' after '${identifier.value}' but found '=='. Use '=' for assignment, '==' only for comparison.`);
      }
      else {
         value = { name: 'NumericNode', value: '0' };
         autoFlag = true;
      }

      declarations.push({
         name: 'DeclarationNode',
         identifier: identifier.value!,
         value: value,
         autoInitialized: autoFlag
      });

      if (parserTokens[parserIndex + 1]?.name === 'CommaToken') {
         nextIndex();
         if (parserTokens[parserIndex + 1]?.name !== 'IdentifierToken') {
            throw new SyntaxError('Expected an identifier after comma in declaration.');
         }
         continue;
      }
      break;
   }

   return declarations;
}

function assignmentParser(): atype.AssignmentNode {
   const identifier = parserTokens[parserIndex];
   nextIndex();

   let target: atype.IdentifierNode | atype.ArrayIndexNode = {
      name: 'IdentifierNode', 
      value: identifier.value 
   };

   if (parserTokens[parserIndex].name === 'OpenBracketToken') {
      parserIndex--;  // Go back one position in order to `arrayIndexParser` work correctly
      target = arrayIndexParser();
      nextIndex();
   }

    if (parserTokens[parserIndex].name !== 'AssignmentToken') {
       if (parserTokens[parserIndex].name === 'RelationalToken' && parserTokens[parserIndex].value === '==') {
          throw new SyntaxError(`Expected '=' after '${identifier.value}' but found '=='. Use '=' for assignment, '==' only for comparison.`);
       }
       throw new SyntaxError(`Expected '=' after identifier but found '${parserTokens[parserIndex].value}'. Use 'identifier = value' to assign.`);
    }
   // VCAA-style '←' creates the variable if it does not exist yet
   const implicitDeclare = parserTokens[parserIndex].value === '←';
   nextIndex();

   let value = expressionParser();

   return { 
      name: 'AssignmentNode',
      identifier: target,
      value: value,
      implicitDeclare: implicitDeclare
   };
}


function printParser() : atype.PrintNode {
   nextIndex();
   let value = expressionParser();

   return {
      name: 'PrintNode',
      value: value
   }
}

function readParser() : atype.ReadNode[] {
   const reads: atype.ReadNode[] = [];

   while (true) {
      nextIndex();
      const identifier = parserTokens[parserIndex] as atype.IdentifierToken;

      reads.push({
         name: 'ReadNode',
         identifier: identifier
      });

      if (parserTokens[parserIndex + 1]?.name === 'CommaToken') {
         nextIndex();
         if (parserTokens[parserIndex + 1]?.name !== 'IdentifierToken') {
            throw new SyntaxError('Expected an identifier after comma in read statement.');
         }
         continue;
      }
      break;
   }

   return reads;
}

// Condition of if/while, with or without brackets: if (a > b)  or  if a > b then
function conditionParser(keyword: string): atype.Node {
   if (!parserTokens[parserIndex + 1] || parserTokens[parserIndex + 1].line !== parserTokens[parserIndex].line) {
      throw new SyntaxError(`Expected a condition after '${keyword}'.`);
   }
   nextIndex();
   const expression = expressionParser();
   if (parserTokens[parserIndex + 1]?.name === 'AssignmentToken') {
      throw new SyntaxError(`Unexpected '=' in ${keyword} condition. Use '==' to compare values, not '=' (assignment).`);
   }
   return expression.name === 'GroupNode' ? expression.body : expression;
}

function ifParser() : atype.IfNode {
   let expression = conditionParser('if');
   if (parserTokens[parserIndex + 1]?.name === 'ThenToken') {
      nextIndex();
   }
   nextIndex();
   let body = new Array<atype.SentencesNode>;
   let alternative = new Array<atype.SentencesNode>;
   let storeSentencesInBody = true;
   while (parserTokens[parserIndex].name !== 'CloseIfToken') {

       if (parserTokens[parserIndex].name === 'OpenIfElseToken') {
          if (!storeSentencesInBody) {
             throw new SyntaxError('An if statement can only have one else clause.');
          }
          storeSentencesInBody = false;

          // 'else if' on one line chains into a nested if that shares the closing endif
          const next = parserTokens[parserIndex + 1];
          if (next?.name === 'OpenIfToken' && next.line === parserTokens[parserIndex].line) {
             nextIndex();
             alternative.push(ifParser());
             break;
          }
       }
      else {
            if (storeSentencesInBody) {
               body.push(...parse());
            }
            else {
               alternative.push(...parse());
            }
      }

      nextIndex();
   }

   return {
      name: 'IfNode',
      argument: expression,
      body: body,
      alternative: alternative
   }
}

function switchParser() : atype.SwitchNode {
   nextIndex();
   if (parserTokens[parserIndex].name !== 'OpenParenToken') {
      expectOpenParen('switch');
   }
   nextIndex();
   let expression = expressionParser();
   nextIndex();
   if (parserTokens[parserIndex].name !== 'CloseParenToken') {
      expectCloseParen('switch');
   }
   nextIndex();

    let cases = new Array<atype.CaseNode>;

    if (parserTokens[parserIndex].name === 'CloseSwitchToken') {
       throw new SyntaxError('A switch statement must have at least one case clause.');
    }

    while (parserTokens[parserIndex].name !== 'CloseSwitchToken') {
      if (parserTokens[parserIndex].name !== 'OpenCaseToken') {
         throw new SyntaxError('Switch should start with a case statement.');
      }
      nextIndex();
      let caseArgument = tokenToNode(parserTokens[parserIndex]);
      nextIndex();
      if (parserTokens[parserIndex].value !== ':') {
         throw new SyntaxError(': after case argument is needed');
      }
      nextIndex();
   
      let caseSentences = new Array<atype.SentencesNode>;
      while (parserTokens[parserIndex].name !== 'CloseCaseToken') {
         caseSentences.push(...parse());
         nextIndex();
      }
      nextIndex();

      cases.push({
         name: 'CaseNode',
         argument: caseArgument,
         body: caseSentences
      });
   }

   return {
      name: 'SwitchNode',
      argument: expression,
      cases: cases
   }
}

function repeatParser() : atype.RepeatNode {
   nextIndex();
   if (parserTokens[parserIndex].name !== 'OpenParenToken') {
      expectOpenParen('repeat');
   }
   nextIndex();
   if (parserTokens[parserIndex].value !== reservedWords.CODE_REPEATDECLARE &&
         parserTokens[parserIndex].name !== 'DeclarationToken') {
      throw new SyntaxError(`Expected '${reservedWords.CODE_REPEATDECLARE}' or 'declare' after '('. A repeat loop needs a counter variable.`);
   }
   let declaration = declarationParser()[0];
   nextIndex();
   if (parserTokens[parserIndex].value !== reservedWords.CODE_REPEATTO) {
      throw new SyntaxError(`Expected '${reservedWords.CODE_REPEATTO}' to set the upper limit of the loop.`);
   }
   nextIndex();
   let to = expressionParser();
   nextIndex();
   if (parserTokens[parserIndex].value !== reservedWords.CODE_REPEATSTEP) {
      throw new SyntaxError(`Expected '${reservedWords.CODE_REPEATSTEP}' to set the increment.`);
   }
   nextIndex();
   let steps = expressionParser();
   nextIndex();
   if (parserTokens[parserIndex].name !== 'CloseParenToken') {
      expectCloseParen('repeat');
   }
   nextIndex();

   let forSentences = new Array<atype.SentencesNode>;
   while (parserTokens[parserIndex].name !== 'CloseRepeatToken') {
      forSentences.push(...parse());
      nextIndex();
   }

   return {
      name: 'RepeatNode',
      declaration: declaration,
      to: to,
      steps: steps,
      body: forSentences
   }
}

function isForStatement(): boolean {
   return parserTokens[parserIndex]?.name === 'IdentifierToken' &&
      parserTokens[parserIndex].value === 'for' &&
      parserTokens[parserIndex + 1]?.name === 'IdentifierToken' &&
      parserTokens[parserIndex + 2]?.value === 'from';
}

// Commands that start with a plain word, from the convention: open, close, append, report.
// The word is still a normal variable when it is followed by '←', '=', '[', '(' or '.'

function isCommandStatement(): boolean {
   const token = parserTokens[parserIndex];
   const next = parserTokens[parserIndex + 1];
   if (token?.name !== 'IdentifierToken' || !convention.commands.includes(token.value!)) return false;
   if (!next || next.line !== token.line) return false;
   if (['AssignmentToken', 'OpenBracketToken', 'DotToken'].includes(next.name)) return false;
   // append (1, key) to list  starts with a bracket, so it needs the 'to' to tell it from a call
   if (token.value === 'append') return hasWordOnLine('to');
   return next.name !== 'OpenParenToken';
}

function hasWordOnLine(word: string): boolean {
   const line = parserTokens[parserIndex].line;
   for (let i = parserIndex + 1; i < parserTokens.length && parserTokens[i].line === line; i++) {
      if (parserTokens[i].value === word) return true;
   }
   return false;
}

// open <file> [for reading|writing]  |  close <file>  |  append <value> to <list>  |  report <value>
function commandParser(): atype.SentencesNode {
   const command = parserTokens[parserIndex].value;
   nextIndex();
   const value = expressionParser();

   if (command === 'open') {
      let mode = 'reading';
      if (parserTokens[parserIndex + 1]?.value === 'for') {
         nextIndex();
         nextIndex();
         mode = parserTokens[parserIndex].value!;
         if (!['reading', 'writing'].includes(mode)) {
            throw new SyntaxError(`Expected 'reading' or 'writing' after 'open ... for' but found '${mode}'.`);
         }
      }
      return { name: 'OpenFileNode', file: value, mode };
   }
   if (command === 'close') {
      return { name: 'CloseFileNode', file: value };
   }
   if (command === 'append') {
      nextIndex();
      if (parserTokens[parserIndex].value !== 'to') {
         throw new SyntaxError(`Expected 'to' in 'append ... to list' but found '${parserTokens[parserIndex].value}'.`);
      }
      nextIndex();
      const list = parserTokens[parserIndex];
      if (list.name !== 'IdentifierToken') {
         throw new SyntaxError(`Expected a list name after 'append ... to' but found '${list.value}'.`);
      }
      return { name: 'AppendNode', value, list: { name: 'IdentifierNode', value: list.value } };
   }
   return { name: 'PrintNode', value };
}

// read next integer|number|line|word from <file>
function fileReadParser(): atype.FileReadNode {
   nextIndex(); // 'next'
   nextIndex();
   const kind = parserTokens[parserIndex].value!;
   const kinds = convention.fileRead.kinds;
   if (!kinds.includes(kind)) {
      throw new SyntaxError(`Expected ${kinds.join(', ')} after 'read next' but found '${kind}'.`);
   }
   nextIndex();
   if (parserTokens[parserIndex].value !== 'from') {
      throw new SyntaxError(`Expected 'from' in 'read next ${kind} from ...' but found '${parserTokens[parserIndex].value}'.`);
   }
   nextIndex();
   return { name: 'FileReadNode', file: expressionParser(), kind };
}

// for i from <start> to <end> [step <n>] ... endfor  (VCAA style, 'to' is inclusive)
function forParser() : atype.RepeatNode {
   nextIndex();
   const counter = parserTokens[parserIndex];
   nextIndex(); // 'from'
   nextIndex();
   const start = expressionParser();
   nextIndex();
   if (parserTokens[parserIndex].value !== 'to') {
      throw new SyntaxError(`Expected 'to' in 'for ${counter.value} from ... to ...' but found '${parserTokens[parserIndex].value}'.`);
   }
   nextIndex();
   const to = expressionParser();

   let steps: atype.Node = { name: 'NumericNode', value: '1' };
   if (parserTokens[parserIndex + 1]?.value === 'step') {
      nextIndex();
      nextIndex();
      steps = expressionParser();
   }
   nextIndex();

   let forSentences = new Array<atype.SentencesNode>;
   while (parserTokens[parserIndex].name !== 'CloseForToken') {
      forSentences.push(...parse());
      nextIndex();
   }

   return {
      name: 'RepeatNode',
      declaration: {
         name: 'DeclarationNode',
         identifier: counter.value!,
         value: start
      },
      to: to,
      steps: steps,
      body: forSentences,
      countUp: true
   }
}

function whileParser() : atype.WhileNode {
   let expression = conditionParser('while');
   nextIndex();

   let whileSentences = new Array<atype.SentencesNode>;
   while (parserTokens[parserIndex].name !== 'CloseWhileToken') {
      whileSentences.push(...parse());
      nextIndex();
   }

   return {
      name: 'WhileNode',
      argument: expression,
      body: whileSentences
   }
}

function dowhileParser() : atype.DowhileNode {
   nextIndex();
   if (parserTokens[parserIndex].name !== 'OpenParenToken') {
      expectOpenParen('dowhile');
   }
   nextIndex();
   let expression = expressionParser();
   nextIndex();
   if (parserTokens[parserIndex].name !== 'CloseParenToken') {
      expectCloseParen('dowhile');
   }
   nextIndex();

   let dowhileSentences = new Array<atype.SentencesNode>;
   while (parserTokens[parserIndex].name !== 'CloseDowhileToken') {
      dowhileSentences.push(...parse());
      nextIndex();
   }

   return {
      name: 'DowhileNode',
      argument: expression,
      body: dowhileSentences,
      do: true
   }
}

function hasEnddefineAhead(): boolean {
   for (let i = parserIndex + 1; i < parserTokens.length; i++) {
      if (parserTokens[i].name === 'CloseDefineToken') return true;
      if (parserTokens[i].name === 'DefineToken') return false;
   }
   return false;
}

function defineParser() : atype.FunctionDefNode {
   const defineToken = parserTokens[parserIndex];
   const line = defineToken.line;
   nextIndex();
   const identifier = parserTokens[parserIndex];
   if (identifier.name !== 'IdentifierToken') {
      throw new SyntaxError(`Expected a function name after '${reservedWords.CODE_DEFINE}' but found '${identifier.value}'.`);
   }
   nextIndex();
   if (parserTokens[parserIndex].name !== 'OpenParenToken') {
      expectOpenParen(identifier.value!);
   }

   const params: string[] = [];
   nextIndex();
   while (parserTokens[parserIndex].name !== 'CloseParenToken') {
      const param = parserTokens[parserIndex];
      if (param.name !== 'IdentifierToken') {
         throw new SyntaxError(`Expected a parameter name in '${identifier.value}' but found '${param.value}'.`);
      }
      if (params.includes(param.value!)) {
         throw new SyntaxError(`Parameter '${param.value}' is repeated in '${identifier.value}'.`);
      }
      params.push(param.value!);
      nextIndex();
      if (parserTokens[parserIndex].name === 'CommaToken') {
         nextIndex();
      }
      else if (parserTokens[parserIndex].name !== 'CloseParenToken') {
         throw new SyntaxError(`Expected ',' or ')' after parameter '${param.value}'.`);
      }
   }

   // Optional colon after the parameter list (VCAA style)
   if (parserTokens[parserIndex + 1]?.value === ':') {
      nextIndex();
   }

   // Without an enddefine the body is every following line indented deeper than 'define' (VCAA style)
   const endsWithKeyword = hasEnddefineAhead();
   if (!endsWithKeyword && !convention.words.defineEndsByIndent) {
      throw new SyntaxError(`Function '${identifier.value}' needs '${reservedWords.CODE_ENDDEFINE}' to show where it ends.`);
   }
   const defineIndent = defineToken.indent ?? 0;

   insideDefine = true;
   let body = new Array<atype.SentencesNode>;
   do {
      const next = parserTokens[parserIndex + 1];
      if (!next) break;
      if (!endsWithKeyword && next.line !== line && (next.indent ?? 0) <= defineIndent) {
         // VCAA writes the closing 'return' level with 'define'; it still belongs to the function
         if (next.name === 'ReturnToken') {
            nextIndex();
            body.push(...parse());
         }
         break;
      }
      nextIndex();
      if (parserTokens[parserIndex].name === 'CloseDefineToken') break;
      body.push(...parse());
   } while (true);
   insideDefine = false;

   return {
      name: 'FunctionDefNode',
      identifier: identifier.value!,
      params: params,
      body: body,
      line: line
   }
}

function returnParser() : atype.ReturnNode {
   const token = parserTokens[parserIndex];
   const next = parserTokens[parserIndex + 1];
   const valueStartTokens = ['NumericToken', 'StringToken', 'IdentifierToken', 'OpenParenToken', 'OpenBracketToken', 'SubstractionToken', 'NotToken'];

   // A value is only taken from the same line, so a bare return followed by another statement works
   if (next && next.line === token.line && valueStartTokens.includes(next.name)) {
      nextIndex();
      const value = expressionParser();
      // return a, b  ->  one tuple, like return (a, b)
      if (convention.words.returnTuple && parserTokens[parserIndex + 1]?.name === 'CommaToken' && parserTokens[parserIndex + 1].line === token.line) {
         const elements = [value];
         while (parserTokens[parserIndex + 1]?.name === 'CommaToken' && parserTokens[parserIndex + 1].line === token.line) {
            nextIndex();
            nextIndex();
            elements.push(expressionParser());
         }
         return { name: 'ReturnNode', value: { name: 'ArrayNode', elements } };
      }
      return { name: 'ReturnNode', value };
   }

   return { name: 'ReturnNode' };
}

// ---------- Phrases from the convention ----------
// A phrase template is matched word by word on one line. A {value} is parsed as an
// expression that ends where the next words of the phrase appear, so in
// 'random real number from a (inclusive) to b' the value is 'a', not a call a(inclusive).
// The first phrase that matches wins; its meaning (after '->') is parsed with the
// matched values put in place of their names.

// `written` is the phrase as far as it matched, for the error message: 'random integer from ...'
type PhraseMiss = { matched: number, expected: string, at: number, written: string[] };
type PhraseState = { line: number | undefined, matched: number, written: string[], captured: Map<string, atype.Node> };

function phraseParser(): atype.Node | null {
   const start = parserIndex;
   let bestMiss: (PhraseMiss & { phrase: Phrase }) | null = null;

   for (const phrase of convention.phrases) {
      const state: PhraseState = { line: parserTokens[start].line, matched: 0, written: [], captured: new Map() };
      const result = matchPhrase(phrase.parts, start, state);
      if (typeof result === 'number') {
         parserIndex = result - 1;
         return phraseMeaning(phrase, state.captured);
      }
      if (!bestMiss || result.matched > bestMiss.matched) bestMiss = { ...result, phrase };
   }

   // Two or more words of a phrase were written, so it was meant: say what is missing
   if (bestMiss && bestMiss.matched >= 2) {
      parserIndex = Math.min(bestMiss.at, parserTokens.length - 1);
      const line = parserTokens[start].line;
      const found = parserTokens.slice(bestMiss.at, bestMiss.at + 3).filter(token => token.line === line).map(token => token.value!);
      throw new SyntaxError(`Expected ${bestMiss.expected} after '${spoken(bestMiss.written)}'` +
         (found.length ? ` but found '${spoken(found)}'.` : '.'));
   }
   parserIndex = start;
   return null;
}

// Returns the index just after the phrase, or how far it got
function matchPhrase(parts: PhrasePart[], at: number, state: PhraseState): number | PhraseMiss {
   if (!parts.length) return at;
   const [part, ...rest] = parts;

   if (part.kind === 'word') {
      const token = parserTokens[at];
      if (token && token.line === state.line && part.options.includes(token.value!)) {
         state.matched++;
         state.written.push(token.value!);
         return matchPhrase(rest, at + 1, state);
      }
      return miss(state, expectedNext(parts), at);
   }

   if (part.kind === 'optional') {
      const matchedBefore = state.matched;
      const writtenBefore = state.written.length;
      const withPart = matchPhrase([...part.parts, ...rest], at, state);
      if (typeof withPart === 'number') return withPart;
      state.matched = matchedBefore;
      state.written.length = writtenBefore;
      const withoutPart = matchPhrase(rest, at, state);
      if (typeof withoutPart === 'number') return withoutPart;
      return withPart.matched >= withoutPart.matched ? withPart : withoutPart;
   }

   // A value: it ends where the words after it start
   const follows = leadingWords(rest);
   const end = findPhraseStop(at, follows, state.line);
   const value = parseValueBetween(at, end);
   if (!value) return miss(state, 'a value', at);
   // The value ended but the phrase's next words are not there
   const phraseMayEnd = follows.some(words => !words.length);
   if ((end !== undefined && value.end !== end) || (end === undefined && !phraseMayEnd)) {
      return miss({ ...state, written: [...state.written, '...'] }, expectedNext(rest), value.end);
   }
   state.captured.set(part.name, value.node);
   state.written.push('...');
   return matchPhrase(rest, value.end, state);
}

// What may come next, for an error message: "'(inclusive)' or 'to'"
function expectedNext(parts: PhrasePart[]): string {
   if (!parts.length) return 'the end of the phrase';
   const [part, ...rest] = parts;
   if (part.kind === 'word') return part.options.map(option => `'${option}'`).join(' or ');
   if (part.kind === 'capture') return 'a value';
   return `'${spoken(partsText(part.parts))}' or ${expectedNext(rest)}`;
}

function partsText(parts: PhrasePart[]): string[] {
   return parts.flatMap(part => part.kind === 'word' ? [part.options[0]] : part.kind === 'capture' ? ['...'] : partsText(part.parts));
}

// Words as they are written: brackets and commas sit against their neighbours
function spoken(words: string[]): string {
   return words.join(' ').replace(/([(\[]) /g, '$1').replace(/ ([)\],])/g, '$1');
}

function miss(state: PhraseState, expected: string, at: number): PhraseMiss {
   return { matched: state.matched, expected, at, written: [...state.written] };
}

// The literal words that can come first after a value; an empty list means the phrase may end there
function leadingWords(parts: PhrasePart[]): string[][][] {
   if (!parts.length) return [[]];
   const [part, ...rest] = parts;
   if (part.kind === 'capture') return [[]];
   if (part.kind === 'optional') return [...leadingWords([...part.parts, ...rest]), ...leadingWords(rest)];
   return leadingWords(rest).map(words => [part.options, ...words]);
}

// First index after `at`, on the same line and outside brackets opened by the value, where one
// of the following word sequences starts
function findPhraseStop(at: number, follows: string[][][], line: number | undefined): number | undefined {
   const sequences = follows.filter(words => words.length);
   let depth = 0;
   for (let i = at; i < parserTokens.length && parserTokens[i].line === line; i++) {
      if (i > at && depth === 0 && sequences.some(words => words.every((options, offset) => {
         const token = parserTokens[i + offset];
         return token?.line === line && options.includes(token.value!);
      }))) {
         return i;
      }
      const name = parserTokens[i].name;
      if (name === 'OpenParenToken' || name === 'OpenBracketToken') depth++;
      if (name === 'CloseParenToken' || name === 'CloseBracketToken') depth--;
      if (depth < 0) return i;
   }
   return undefined;
}

// Parses one expression starting at `from`, never reading past `to`
function parseValueBetween(from: number, to: number | undefined): { node: atype.Node, end: number } | null {
   const saved = parserTokens;
   if (to !== undefined) parserTokens = saved.slice(0, to);
   parserIndex = from;
   try {
      const node = expressionParser();
      return { node, end: parserIndex + 1 };
   } catch (e) {
      if (e instanceof SyntaxError) return null;
      throw e;
   } finally {
      parserTokens = saved;
   }
}

function phraseMeaning(phrase: Phrase, captured: Map<string, atype.Node>): atype.Node {
   const saved = parserTokens;
   const savedIndex = parserIndex;
   parserTokens = lexer(phrase.result);
   parserIndex = 0;
   let meaning: atype.Node;
   try {
      meaning = expressionParser();
      if (parserIndex !== parserTokens.length - 1) throw new SyntaxError('');
   } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      throw new SyntaxError(`The convention phrase '${phrase.source}' has a meaning after '->' that is not a single value.`);
   } finally {
      parserTokens = saved;
      parserIndex = savedIndex;
   }
   return putValues(meaning, captured);
}

// Replaces each name of a {value} with what was matched. Inside a calculation a matched
// calculation keeps its brackets, so 'high - 1' with high = a + b stays (a + b) - 1
function putValues<T>(node: T, captured: Map<string, atype.Node>, inCalculation = false): T {
   if (Array.isArray(node)) return node.map(item => putValues(item, captured, inCalculation)) as T;
   if (!node || typeof node !== 'object') return node;
   const value = node as Record<string, unknown>;
   if (value.name === 'IdentifierNode' && captured.has(value.value as string)) {
      const replacement = captured.get(value.value as string)!;
      return (inCalculation && replacement.name === 'ExpressionNode' ? { name: 'GroupNode', body: replacement } : replacement) as T;
   }
   const calculation = value.name === 'ExpressionNode' || value.name === 'NotNode';
   return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, putValues(item, captured, calculation)])) as T;
}

function callParser(): atype.CallNode {
   const callee = parserTokens[parserIndex].value!;
   nextIndex(); // '('

   const args: atype.Node[] = [];
   nextIndex();
   while (parserTokens[parserIndex].name !== 'CloseParenToken') {
      args.push(expressionParser());
      nextIndex();
      if (parserTokens[parserIndex].name === 'CommaToken') {
         nextIndex();
      }
      else if (parserTokens[parserIndex].name !== 'CloseParenToken') {
         throw new SyntaxError(`Expected ',' or ')' in call to '${callee}'.`);
      }
   }

   return { name: 'CallNode', callee, args };
}

function arrayParser(): atype.ArrayNode {
   let elements: atype.Node[] = [];

   nextIndex(); // After '['

   while (parserTokens[parserIndex].name !== 'CloseBracketToken') {
      elements.push(expressionParser());

      if (parserTokens[parserIndex + 1]?.name === 'CloseBracketToken') {
         nextIndex();
         break;
      }

      if (parserTokens[parserIndex + 1]?.name !== 'CommaToken') {
         throw new SyntaxError('A comma was expected between array values.');
      }

      nextIndex();
      nextIndex();
   }

   return { name: 'ArrayNode', elements };
}


function arrayIndexParser(): atype.ArrayIndexNode {
   const array = tokenToNode(parserTokens[parserIndex]) as atype.IdentifierNode;

   nextIndex(); // Avanzar a '['

   if (parserTokens[parserIndex].name !== 'OpenBracketToken') {
      throw new SyntaxError('"[" was expected after the identifier.');
   }
   nextIndex(); // Avanzar al índice

   if (parserTokens[parserIndex].name === 'CloseBracketToken') {
      throw new SyntaxError('Index expression was expected between brackets.');
   }

   const index = expressionParser();

   if (!parserTokens[parserIndex + 1] || parserTokens[parserIndex + 1].name !== 'CloseBracketToken') {
      throw new SyntaxError('"]" was expected after index.');
   }
   nextIndex(); // Avanzar a ']'

   let node: atype.ArrayIndexNode = { name: 'ArrayIndexNode', array, index };
   // A position of a position: sigma[i][2]
   while (parserTokens[parserIndex + 1]?.name === 'OpenBracketToken' && parserTokens[parserIndex + 1].line === parserTokens[parserIndex].line) {
      nextIndex();
      nextIndex();
      const inner = expressionParser();
      nextIndex();
      if (parserTokens[parserIndex]?.name !== 'CloseBracketToken') {
         throw new SyntaxError('"]" was expected after index.');
      }
      node = { name: 'ArrayIndexNode', array: node, index: inner };
   }
   return node;
}
