import type * as atype from "./atypes"
import type { Convention } from "../convention/loader";
import { codeWordStore, conventionStore } from "../stores";
import englishWords from "../../i18n/code/en.json";

function escapeRegExp(text: string): string {
   return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTokenMap(word: typeof englishWords, convention: Convention): Array<atype.Token> {
   return [
      { name: 'DeclarationToken',         rule: new RegExp('^' + word.CODE_VAR + '$', 'g') },
      { name: 'PrintToken',               rule: new RegExp('^' + word.CODE_PRINT + '$', 'g') },
      { name: 'ReadToken',                rule: new RegExp('^' + word.CODE_READ + '$', 'g') },
      { name: 'DefineToken',              rule: new RegExp('^' + word.CODE_DEFINE + '$', 'g') },
      { name: 'CloseDefineToken',         rule: new RegExp('^' + word.CODE_ENDDEFINE + '$', 'g') },
      { name: 'ReturnToken',              rule: new RegExp('^' + word.CODE_RETURN + '$', 'g') },
      { name: 'AssignmentToken',          rule: new RegExp('^(' + convention.assignment.map(escapeRegExp).join('|') + ')$', 'g') },
      { name: 'OpenParenToken',           rule: /^\($/g },
      { name: 'CloseParenToken',          rule: /^\)$/g },
      { name: 'OpenIfToken',              rule: new RegExp('^' + word.CODE_IF + '$', 'g') },
      { name: 'ThenToken',                rule: new RegExp('^' + word.CODE_THEN + '$', 'g') },
      { name: 'OpenIfElseToken',          rule: new RegExp('^' + word.CODE_ELSE + '$', 'g') },
      { name: 'CloseIfToken',             rule: new RegExp('^' + word.CODE_ENDIF + '$', 'g') },
      { name: 'OpenSwitchToken',          rule: new RegExp('^' + word.CODE_SWITCH + '$', 'g') },
      { name: 'CloseSwitchToken',         rule: new RegExp('^' + word.CODE_ENDSWITCH + '$', 'g') },
      { name: 'OpenCaseToken',            rule: new RegExp('^' + word.CODE_CASE + '$', 'g') },
      { name: 'CloseCaseToken',           rule: new RegExp('^' + word.CODE_ENDCASE + '$', 'g') },
      { name: 'OpenRepeatToken',          rule: new RegExp('^' + word.CODE_REPEAT + '$', 'g') },
      { name: 'CloseForToken',            rule: new RegExp('^' + word.CODE_ENDFOR + '$', 'g') },
      { name: 'CloseRepeatToken',         rule: new RegExp('^' + word.CODE_ENDREPEAT + '$', 'g') },
      { name: 'OpenWhileToken',           rule: new RegExp('^' + word.CODE_WHILE + '$', 'g') },
      { name: 'CloseWhileToken',          rule: new RegExp('^' + word.CODE_ENDWHILE + '$', 'g') },
      { name: 'OpenDowhileToken',         rule: new RegExp('^' + word.CODE_DOWHILE + '$', 'g') },
      { name: 'CloseDowhileToken',        rule: new RegExp('^' + word.CODE_ENDDOWHILE + '$', 'g') },
      { name: 'AdditionToken',            rule: /^\+$/g },
      { name: 'SubstractionToken',        rule: /^\-$/g },
      { name: 'MultiplicationToken',      rule: /^\*$/g },
      { name: 'DivisionToken',            rule: /^\/$/g },
      { name: 'ModuleToken',              rule: /^\%$/g },
      { name: 'PowerToken',               rule: /^\^$/g },
      { name: 'RelationalToken',          rule: /[\>\<]=?|[\=\!]\=/g },
      { name: 'NotToken',                 rule: new RegExp('^' + word.CODE_NOT + '$', 'g') },
      { name: 'BooleanToken',             rule: new RegExp('^' + word.CODE_AND + '$|^' + word.CODE_OR + '$', 'g') },
      { name: 'StringToken',              rule: /(["'])(?:(?=(\\?))\2.)*?\1/g },
      { name: 'NumericToken',             rule: /^\-?(\d?)+\.?\d+$/g },
      { name: 'IdentifierToken',          rule: /\w+/g },
      { name: 'OpenBracketToken',         rule: /^\[$/g },
      { name: 'CloseBracketToken',        rule: /^\]$/g },
      { name: 'CommaToken',               rule: /^\,$/g },
      { name: 'DotToken',                 rule: /^\.$/g },
      { name: 'OtherToken',               rule: /./g }
   ];
}

// Symbols, the words of the language and the convention's rules are rewritten to
// PseudoFlow's own spelling, so the rest of the pipeline only ever sees one form
const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const SUPERSCRIPT_RUN = new RegExp('^[' + SUPERSCRIPT_DIGITS + ']+$');

function buildWordAliases(word: typeof englishWords, convention: Convention): Record<string, string> {
   const aliases = { ...convention.symbols };
   if (convention.words.upperCaseLogic) {
      for (const logic of [word.CODE_AND, word.CODE_OR, word.CODE_NOT]) aliases[logic.toUpperCase()] = logic;
   }
   return aliases;
}

// '<heading>: <title>' for a heading that starts a chart keeps its title as written
function buildChartHeading(convention: Convention): RegExp | null {
   const headings = Object.keys(convention.headings).filter(heading => convention.headings[heading] === 'chart');
   if (!headings.length) return null;
   return new RegExp('^[ \\t]*(?:' + headings.map(escapeRegExp).join('|') + ')[ \\t]*:[ \\t]*(.*?)[ \\t]*$', 'i');
}

let words = englishWords;
let convention: Convention | null = null;
let tokenStringMap: Array<atype.Token> = [];
let wordAliases: Record<string, string> = {};
let chartHeading: RegExp | null = null;

function rebuild() {
   if (!convention) return;
   tokenStringMap = buildTokenMap(words, convention);
   wordAliases = buildWordAliases(words, convention);
   chartHeading = buildChartHeading(convention);
}

codeWordStore.subscribe(value => { words = value; rebuild(); });
conventionStore.subscribe(value => { convention = value; rebuild(); });

// Width of the leading whitespace of the line starting at `start` (tabs count as 4)
function indentAt(code: string, start: number): number {
   let column = 0;
   for (let i = start; i < code.length; i++) {
      if (code[i] === ' ') column++;
      else if (code[i] === '\t') column += 4 - (column % 4);
      else break;
   }
   return column;
}

export const lexer = (code: string) : Array<atype.Token> => {
   const rules = convention;
   if (!rules) throw new Error('The pseudocode convention is not loaded.');
   // remove comments
   code = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g,'');
   // separate words to lexer
    const regex = /(["'])(?:(?=(\\?))\2.)*?\1|(?:[=&|+<>/*%!~-]{1,2})|(\-?\d?)+\.?\d+|(?:[\\(){}[\];\:\?]|(?:\w+))|[⁰¹²³⁴⁵⁶⁷⁸⁹]+|[^\s]/g;

   let tokens : Array<atype.Token> = [];
   let match;
   let line = 1;
   let lineStart = 0;
   let lastIndex = 0;

   while ((match = regex.exec(code)) !== null) {
      for (let i = lastIndex; i < match.index; i++) {
         if (code[i] === '\n') {
            line++;
            lineStart = i + 1;
         }
      }
      lastIndex = regex.lastIndex;

      const indent = indentAt(code, lineStart);
      if (chartHeading && code.slice(lineStart, match.index).trim() === '') {
         const lineEnd = code.indexOf('\n', match.index) < 0 ? code.length : code.indexOf('\n', match.index);
         const header = code.slice(lineStart, lineEnd).match(chartHeading);
         if (header) {
            tokens.push({ name: 'AlgorithmToken', value: header[1], line, indent } as atype.Token);
            regex.lastIndex = lastIndex = lineEnd;
            continue;
         }
      }
      // Superscript digits are a power: 10⁷ is 10^7, 2¹⁰ is 2^10
      if (rules.words.superscriptPowers && SUPERSCRIPT_RUN.test(match[0])) {
         const exponent = [...match[0]].map(c => SUPERSCRIPT_DIGITS.indexOf(c)).join('');
         tokens.push({ name: 'PowerToken', value: '^', line, indent } as atype.Token);
         tokens.push({ name: 'NumericToken', value: exponent, line, indent } as atype.Token);
         continue;
      }

      // A word followed by ':' is a heading ('Input: ...'), so it keeps its own spelling
      const isHeading = /^\w+$/.test(match[0]) && /^[ \t]*:/.test(code.slice(regex.lastIndex));
      const word = !isHeading && Object.prototype.hasOwnProperty.call(wordAliases, match[0]) ? wordAliases[match[0]] : match[0];
      for (const { name, rule } of tokenStringMap) {
         if (word.match(rule!)) {
            tokens.push({ name, value: word, line, indent } as atype.Token);
            break;
         }
      }
   }
   return mergeTwoWordEnds(tokens);
}

// 'end if', 'end while', 'end for', ... written as two words become the closing keyword
function mergeTwoWordEnds(tokens: Array<atype.Token>): Array<atype.Token> {
   const merged: Array<atype.Token> = [];
   for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const next = tokens[i + 1];
      if (token.name === 'IdentifierToken' && convention!.words.endPrefixes.includes(token.value!) && next && next.line === token.line) {
         const combined = token.value! + next.value;
         const closing = tokenStringMap.find(({ name, rule }) => name.startsWith('Close') && combined.match(rule!));
         if (closing) {
            merged.push({ name: closing.name, value: combined, line: token.line, indent: token.indent } as atype.Token);
            i++;
            continue;
         }
      }
      merged.push(token);
   }
   return merged;
};
