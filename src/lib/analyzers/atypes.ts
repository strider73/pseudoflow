// *******************************************
// Tokens
// *******************************************

export type DeclarationToken =         { name: 'DeclarationToken', rule?: RegExp, value?: string };
export type ReadToken =                { name: 'ReadToken', rule?: RegExp, value?: string };
export type PrintToken =               { name: 'PrintToken', rule?: RegExp, value?: string };
export type DefineToken =              { name: 'DefineToken', rule?: RegExp, value?: string };
export type CloseDefineToken =         { name: 'CloseDefineToken', rule?: RegExp, value?: string };
export type ReturnToken =              { name: 'ReturnToken', rule?: RegExp, value?: string };
export type AssignmentToken =          { name: 'AssignmentToken', rule?: RegExp, value?: string };
export type OpenParenToken =           { name: 'OpenParenToken', rule?: RegExp, value?: string };
export type CloseParenToken =          { name: 'CloseParenToken', rule?: RegExp, value?: string };
export type OpenIfToken =              { name: 'OpenIfToken', rule?: RegExp, value?: string };
export type OpenIfElseToken =          { name: 'OpenIfElseToken', rule?: RegExp, value?: string };
export type CloseIfToken =             { name: 'CloseIfToken', rule?: RegExp, value?: string };
export type OpenSwitchToken =          { name: 'OpenSwitchToken', rule?: RegExp, value?: string };
export type CloseSwitchToken =         { name: 'CloseSwitchToken', rule?: RegExp, value?: string };
export type OpenCaseToken =            { name: 'OpenCaseToken', rule?: RegExp, value?: string };
export type CloseCaseToken =           { name: 'CloseCaseToken', rule?: RegExp, value?: string };
export type OpenRepeatToken =          { name: 'OpenRepeatToken', rule?: RegExp, value?: string };
export type CloseRepeatToken =         { name: 'CloseRepeatToken', rule?: RegExp, value?: string };
export type OpenWhileToken =           { name: 'OpenWhileToken', rule?: RegExp, value?: string };
export type CloseWhileToken =          { name: 'CloseWhileToken', rule?: RegExp, value?: string };
export type OpenDowhileToken =         { name: 'OpenDowhileToken', rule?: RegExp, value?: string };
export type CloseDowhileToken =        { name: 'CloseDowhileToken', rule?: RegExp, value?: string };
export type AdditionToken =            { name: 'AdditionToken', rule?: RegExp, value?: string };
export type SubstractionToken =        { name: 'SubstractionToken', rule?: RegExp, value?: string };
export type MultiplicationToken =      { name: 'MultiplicationToken', rule?: RegExp, value?: string };
export type DivisionToken =            { name: 'DivisionToken', rule?: RegExp, value?: string };
export type ModuleToken =              { name: 'ModuleToken', rule?: RegExp, value?: string };
export type RelationalToken =          { name: 'RelationalToken', rule?: RegExp, value?: string };
export type NotToken =                 { name: 'NotToken', rule?: RegExp, value?: string };
export type ThenToken =                { name: 'ThenToken', rule?: RegExp, value?: string };
export type CloseForToken =            { name: 'CloseForToken', rule?: RegExp, value?: string };
export type PowerToken =               { name: 'PowerToken', rule?: RegExp, value?: string };
export type BooleanToken =             { name: 'BooleanToken', rule?: RegExp, value?: string };
export type StringToken =              { name: 'StringToken', rule?: RegExp, value?: string };
export type NumericToken =             { name: 'NumericToken', rule?: RegExp, value?: string };
export type IdentifierToken =          { name: 'IdentifierToken', rule?: RegExp, value?: string };
export type OpenBracketToken =         { name: 'OpenBracketToken', rule?: RegExp, value?: string };
export type CloseBracketToken =        { name: 'CloseBracketToken', rule?: RegExp, value?: string };
export type CommaToken =               { name: 'CommaToken', rule?: RegExp, value?: string };
export type DotToken =                 { name: 'DotToken', rule?: RegExp, value?: string };
export type OtherToken =               { name: 'OtherToken', rule?: RegExp, value?: string };
export type AlgorithmToken =           { name: 'AlgorithmToken', rule?: RegExp, value?: string };

export type ArithmeticToken = 
   AdditionToken              | 
   SubstractionToken          | 
   MultiplicationToken        | 
   DivisionToken              | 
   ModuleToken                |
   PowerToken;

export type OperatorToken =
   ArithmeticToken            |
   RelationalToken            |
   BooleanToken;

export type ArrayToken = 
    OpenBracketToken           |
    CloseBracketToken          |
    CommaToken                 |
    DotToken;

export type Token = { line?: number, indent?: number } & (
   DeclarationToken           | 
   PrintToken                 | 
   ReadToken                  | 
   DefineToken                | 
   CloseDefineToken           | 
   AlgorithmToken             | 
   ReturnToken                | 
   AssignmentToken            | 
   OpenParenToken             | 
   CloseParenToken            | 
   OpenIfToken                | 
   OpenIfElseToken            | 
   CloseIfToken               | 
   OpenSwitchToken            | 
   CloseSwitchToken           | 
   OpenCaseToken              | 
   CloseCaseToken             | 
   OpenRepeatToken            | 
   CloseRepeatToken           | 
   OpenWhileToken             | 
   CloseWhileToken            | 
   OpenDowhileToken           | 
   CloseDowhileToken          | 
   ArithmeticToken            | 
   RelationalToken            | 
   BooleanToken               | 
   NotToken                   | 
   ThenToken                  | 
   CloseForToken              | 
   StringToken                | 
   NumericToken               | 
   IdentifierToken            | 
   OtherToken                 |
   OpenBracketToken           |
   CloseBracketToken          |
   CommaToken
);

// *******************************************
// Nodes
// *******************************************

export type DeclarationNode =          { name: 'DeclarationNode', identifier: string, value: Node, autoInitialized?: boolean };
export type AssignmentNode =           { name: 'AssignmentNode', identifier: IdentifierNode | ArrayIndexNode, value: Node, implicitDeclare?: boolean };
export type PrintNode =                { name: 'PrintNode', value: Node };
export type ReadNode =                 { name: 'ReadNode', identifier: IdentifierToken };
export type IfNode =                   { name: 'IfNode', argument: Node, body: SentencesNode[], alternative: SentencesNode[] };
export type SwitchNode =               { name: 'SwitchNode', argument: Node, cases: CaseNode[] };
export type CaseNode =                 { name: 'CaseNode', argument: Node, body: SentencesNode[]};
export type RepeatNode =               { name: 'RepeatNode', declaration: DeclarationNode, to: Node, steps: Node, body: SentencesNode[], countUp?: boolean };
export type WhileNode =                { name: 'WhileNode', argument: Node, body: SentencesNode[]};
export type DowhileNode =              { name: 'DowhileNode', argument: Node, body: SentencesNode[], do: boolean};
export type FunctionDefNode =          { name: 'FunctionDefNode', identifier: string, params: string[], body: SentencesNode[], line?: number };
// Marks where an 'Algorithm: <title>' starts; the statements after it, up to the next one, are its body
export type AlgorithmNode =            { name: 'AlgorithmNode', title: string, line?: number };
export type ReturnNode =               { name: 'ReturnNode', value?: Node };
export type CallStatementNode =        { name: 'CallStatementNode', call: CallNode };
export type CallNode =                 { name: 'CallNode', callee: string, args: Node[] };
export type OpenFileNode =             { name: 'OpenFileNode', file: Node, mode: string };
export type CloseFileNode =            { name: 'CloseFileNode', file: Node };
export type AppendNode =               { name: 'AppendNode', value: Node, list: IdentifierNode };
export type FileReadNode =             { name: 'FileReadNode', file: Node, kind: string };
export type NotNode =                  { name: 'NotNode', value: Node };
export type GroupNode =                { name: 'GroupNode', body: Node };
export type IdentifierNode =           { name: 'IdentifierNode', value: string | undefined };
export type StringNode =               { name: 'StringNode', value: string | undefined };
export type NumericNode =              { name: 'NumericNode', value: string | undefined };
export type ArrayNode =                { name: 'ArrayNode', elements: Node[] };
// array is another ArrayIndexNode for a position of a position: sigma[i][2]
export type ArrayIndexNode =           { name: 'ArrayIndexNode', array: ArrayNode | IdentifierNode | ArrayIndexNode, index: Node }
export type PropertyAccessNode =       { name: 'PropertyAccessNode', object: Node, property: string }

export type SentencesNode = 
   DeclarationNode            | 
   AssignmentNode             |
   PrintNode                  | 
   ReadNode                   | 
   IfNode                     | 
   SwitchNode                 | 
   RepeatNode                 | 
   WhileNode                  | 
   DowhileNode                | 
   FunctionDefNode            | 
   AlgorithmNode              | 
   ReturnNode                 | 
   CallStatementNode          |
   OpenFileNode               |
   CloseFileNode              |
   AppendNode;

// *******************************************
// Expressions
// *******************************************

export type StringExpressionNode =     { name: 'StringExpressionNode', left: StringNode | IdentifierNode, right: Node };
export type ArithmeticExpressionNode = { name: 'ArithmeticExpressionNode', left: NumericNode | IdentifierNode, right: Node, operator: ArithmeticToken };
export type RelationalExpressionNode = { name: 'RelationalExpressionNode', left: Node, right: Node, operator: RelationalToken };
export type BooleanExpressionNode =    { name: 'BooleanExpressionNode', left: Node, right: Node, operator: BooleanToken };
export type ExpressionNode =           { name: 'ExpressionNode', left: Node, right: Node, operator: OperatorToken};
export type ConditionalExpressionNode ={ name: 'ConditionalExpressionNode', left: Node, right: Node, operator: RelationalToken, and?: ConditionalExpressionNode | Node, or?: ConditionalExpressionNode | Node};

export type AnalysisError = {
   type: 'syntax' | 'semantic'
   message: string
   line?: number
}

export type AnalysisResult = {
   program: { body: SentencesNode[] } | null
   errors: AnalysisError[]
}

export type Node = 
   StringExpressionNode       | 
   ArithmeticExpressionNode   | 
   RelationalExpressionNode   | 
   BooleanExpressionNode      | 
   ExpressionNode             | 
   GroupNode                  | 
   IdentifierNode             | 
   StringNode                 | 
   NumericNode                |
   ArrayNode                  |
   ArrayIndexNode             |
   PropertyAccessNode         |
   CallNode                   |
   FileReadNode               |
   NotNode;