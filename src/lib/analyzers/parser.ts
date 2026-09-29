import type * as atype from './atypes'
import { codeWordStore } from "../stores";

let reservedWords;
codeWordStore.subscribe(value => {
   reservedWords = value;
});

let parserIndex: number;
let parserTokens: Array<atype.Token>;
let insideDefine = false;

const STATEMENT_START_TOKENS = [
   'DeclarationToken', 'PrintToken', 'ReadToken', 'IdentifierToken',
   'OpenIfToken', 'OpenSwitchToken', 'OpenRepeatToken',
   'OpenWhileToken', 'OpenDowhileToken', 'DefineToken', 'ReturnToken'
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
                if (isForStatement()) break;
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

   const validStartTokens = ['NumericToken', 'StringToken', 'IdentifierToken', 'OpenParenToken', 'OpenBracketToken'];
   if (!validStartTokens.includes(token.name)) {
      throw new SyntaxError('Expected a value');
   }

   if (
      token.name === 'IdentifierToken' && token.value === 'random' &&
      parserTokens[parserIndex + 1]?.value === 'integer' &&
      parserTokens[parserIndex + 2]?.value === 'from'
   ) {
      return randomPhraseParser();
   }

   if (token.name === 'OpenParenToken') {
      nextIndex();
      const inner = expressionParser(0);
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
   const defineIndent = defineToken.indent ?? 0;

   insideDefine = true;
   let body = new Array<atype.SentencesNode>;
   do {
      const next = parserTokens[parserIndex + 1];
      if (!next) break;
      if (!endsWithKeyword && next.line !== line && (next.indent ?? 0) <= defineIndent) break;
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
      return { name: 'ReturnNode', value: expressionParser() };
   }

   return { name: 'ReturnNode' };
}

// random integer from <low> to <high> [inclusive | exclusive]  ->  randominteger(low, high)
function randomPhraseParser(): atype.CallNode {
   nextIndex(); // 'integer'
   nextIndex(); // 'from'
   nextIndex();
   const low = expressionParser();
   nextIndex();
   if (parserTokens[parserIndex].value !== 'to') {
      throw new SyntaxError(`Expected 'to' in 'random integer from ... to ...' but found '${parserTokens[parserIndex].value}'.`);
   }
   nextIndex();
   let high = expressionParser();

   const bound = parserTokens[parserIndex + 1]?.value;
   if (bound === 'inclusive') {
      nextIndex();
   }
   else if (bound === 'exclusive') {
      nextIndex();
      high = {
         name: 'ExpressionNode',
         left: { name: 'GroupNode', body: high },
         right: { name: 'NumericNode', value: '1' },
         operator: { name: 'SubstractionToken', value: '-' }
      };
   }

   return { name: 'CallNode', callee: 'randominteger', args: [low, high] };
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

   return { name: 'ArrayIndexNode', array, index };
}
