import type * as atype from './atypes'
import type { AnalysisError } from './atypes'

type ValueType = 'number' | 'string' | 'boolean' | 'array'

const ARITHMETIC_OPS = ['+', '-', '*', '/', '%', '^']
const COMPARISON_OPS = ['==', '!=', '<', '>', '<=', '>=']
const BOOLEAN_OPS = ['&&', '||']
export const BUILTIN_FUNCTIONS: Record<string, number> = { randominteger: 2, randomreal: 2 }

export function semanticAnalyzer(program: { body: atype.SentencesNode[] }): AnalysisError[] {
   const errors: AnalysisError[] = []
   const symbols: { name: string, type?: ValueType }[] = []
   const functions = new Map<string, atype.FunctionDefNode>()
   let scopeStart = 0

   function walkNode(node: atype.SentencesNode) {
      switch (node.name) {
         case 'DeclarationNode': {
            checkRedeclared(node.identifier)
            let type: ValueType | undefined
            if (!node.autoInitialized && (node.value && node.value.name !== 'StringNode' || node.value?.value !== undefined)) {
               type = inferType(node.value)
            }
            symbols.push({ name: node.identifier, type })
            if (node.value) checkTypeInValue(node.value, type)
            break
         }

         case 'AssignmentNode': {
            const valueType = inferType(node.value)
            if (node.identifier.name === 'IdentifierNode' && node.identifier.value) {
               const sym = findSymbol(node.identifier.value)
               if (sym) checkTypeConsistency(node.identifier.value, valueType, sym.type)
               if (!sym && node.implicitDeclare) {
                  symbols.push({ name: node.identifier.value, type: valueType })
               }
               else if (!sym) {
                  errors.push({
                     type: 'semantic',
                     message: `Variable '${node.identifier.value}' is not declared`
                  })
               }
            }
            if (node.identifier.name === 'ArrayIndexNode' && node.implicitDeclare && !findSymbol(node.identifier.array.value!)) {
               symbols.push({ name: node.identifier.array.value!, type: 'array' })
            }
            if (node.identifier.name === 'ArrayIndexNode') {
               checkDeclared(node.identifier.array.value!)
               const sym = findSymbol(node.identifier.array.value!)
               if (sym && sym.type && sym.type !== 'array') {
                  errors.push({
                     type: 'semantic',
                     message: `Variable '${sym.name}' is not an array`
                  })
               }
            }
            checkTypeInValue(node.value, valueType)
            break
         }

          case 'ReadNode':
             if (!findSymbol(node.identifier.value!)) {
                symbols.push({ name: node.identifier.value! })
             }
             break

         case 'PrintNode':
            checkTypeInValue(node.value)
            break

         case 'IfNode':
            checkTypeInValue(node.argument)
            node.body.forEach(walkNode)
            node.alternative.forEach(walkNode)
            break

         case 'SwitchNode':
            checkTypeInValue(node.argument)
            node.cases.forEach(c => c.body.forEach(walkNode))
            break

         case 'RepeatNode': {
            // A VCAA 'for' counter may reuse a variable from an earlier loop
            const existingCounter = node.countUp ? findSymbol(node.declaration.identifier) : undefined
            if (!existingCounter) checkRedeclared(node.declaration.identifier)
            const declType = inferType(node.declaration.value)
            if (declType && declType !== 'number') {
               errors.push({
                  type: 'semantic',
                  message: `Loop variable '${node.declaration.identifier}' should be numeric`
               })
            }
            symbols.push({ name: node.declaration.identifier, type: 'number' })
            checkTypeInValue(node.declaration.value)
            checkTypeInValue(node.to, 'number')
            checkTypeInValue(node.steps, 'number')
            node.body.forEach(walkNode)
            break
         }

         case 'WhileNode':
            checkTypeInValue(node.argument)
            node.body.forEach(walkNode)
            break

         case 'DowhileNode':
            checkTypeInValue(node.argument)
            node.body.forEach(walkNode)
            break

         case 'ReturnNode':
            checkTypeInValue(node.value)
            break

         case 'CallStatementNode':
            checkTypeInValue(node.call)
            break

         case 'OpenFileNode':
         case 'CloseFileNode':
            checkTypeInValue(node.file)
            break

         case 'AppendNode': {
            checkDeclared(node.list.value!)
            const sym = findSymbol(node.list.value!)
            if (sym && sym.type && sym.type !== 'array') {
               errors.push({ type: 'semantic', message: `Variable '${sym.name}' is not a list` })
            }
            checkTypeInValue(node.value)
            break
         }
      }
   }

   function inferType(node: atype.Node | undefined): ValueType | undefined {
      if (!node) return undefined
      switch (node.name) {
         case 'NumericNode':
            return 'number'
         case 'StringNode':
            return 'string'
         case 'ArrayNode':
            return 'array'
         case 'IdentifierNode': {
            const sym = findSymbol(node.value!)
            return sym?.type
         }
         case 'ArrayIndexNode':
            return undefined
         case 'PropertyAccessNode':
            return 'number'
         case 'ExpressionNode': {
            const leftType = inferType(node.left)
            const rightType = inferType(node.right)
            const op = node.operator.value
            if (ARITHMETIC_OPS.includes(op)) {
               if (op === '+') {
                  if (leftType === 'string' || rightType === 'string') return 'string'
                  return 'number'
               }
               return 'number'
            }
            if (COMPARISON_OPS.includes(op)) return 'boolean'
            if (BOOLEAN_OPS.includes(op)) return 'boolean'
            return undefined
         }
         case 'GroupNode':
            return inferType(node.body)
         case 'NotNode':
            return 'boolean'
         case 'FileReadNode':
            return node.kind === 'integer' || node.kind === 'number' ? 'number' : 'string'
         case 'CallNode':
            return node.callee in BUILTIN_FUNCTIONS && !functions.has(node.callee) ? 'number' : undefined
         default:
            return undefined
      }
   }

   function checkTypeInValue(node: atype.Node | undefined, expectedType?: ValueType) {
      if (!node) return
      switch (node.name) {
         case 'ExpressionNode': {
            const leftType = inferType(node.left)
            const rightType = inferType(node.right)
            const op = node.operator.value
            if (['/', '%'].includes(op)) {
               if (node.right.name === 'NumericNode' && node.right.value === '0') {
                  errors.push({ type: 'semantic', message: `Division by zero` })
               }
            }
            if (ARITHMETIC_OPS.includes(op) && op !== '+') {
               if (leftType && leftType !== 'number') {
                  errors.push({ type: 'semantic', message: `Operator '${op}' requires numeric operands, but left side is ${leftType}` })
               }
               if (rightType && rightType !== 'number') {
                  errors.push({ type: 'semantic', message: `Operator '${op}' requires numeric operands, but right side is ${rightType}` })
               }
            }
            if (BOOLEAN_OPS.includes(op)) {
               if (leftType && leftType !== 'boolean') {
                  errors.push({ type: 'semantic', message: `Operator '${op}' requires boolean operands, but left side is ${leftType}` })
               }
               if (rightType && rightType !== 'boolean') {
                  errors.push({ type: 'semantic', message: `Operator '${op}' requires boolean operands, but right side is ${rightType}` })
               }
            }
            checkArrayInScalarContext(node.left)
            checkArrayInScalarContext(node.right)
            checkTypeInValue(node.left)
            checkTypeInValue(node.right)
            break
         }
         case 'GroupNode':
            checkTypeInValue(node.body)
            break
         case 'ArrayNode':
            node.elements.forEach(e => checkTypeInValue(e))
            break
         case 'ArrayIndexNode':
            checkDeclared(node.array.value!)
            checkTypeInValue(node.index)
            break
         case 'IdentifierNode':
            // A defined function's name can be passed as a value: gen_mixed_sequence(L, gen_pop, p)
            if (!functions.has(node.value!)) checkDeclared(node.value!)
            break
         case 'PropertyAccessNode':
            checkTypeInValue(node.object)
            break
         case 'CallNode':
            checkCall(node)
            break
         case 'NotNode':
            checkTypeInValue(node.value)
            break
         case 'FileReadNode':
            checkTypeInValue(node.file)
            break
      }
   }

   function checkCall(node: atype.CallNode) {
      const fn = functions.get(node.callee)
      const arity = fn ? fn.params.length : BUILTIN_FUNCTIONS[node.callee]
      // A variable can hold a function passed in as a parameter; its arity is unknown until it runs
      const callsVariable = !fn && findSymbol(node.callee) !== undefined
      if (arity === undefined && !callsVariable) {
         errors.push({ type: 'semantic', message: `Function '${node.callee}' is not defined` })
      }
      else if (arity !== undefined && arity !== node.args.length) {
         errors.push({ type: 'semantic', message: `Function '${node.callee}' expects ${arity} argument(s) but got ${node.args.length}` })
      }
      node.args.forEach(arg => {
         // Lists can be passed to defined functions; the builtins only take numbers
         if (!fn) checkArrayInScalarContext(arg)
         checkTypeInValue(arg)
      })
   }

   function walkFunction(fn: atype.FunctionDefNode) {
      const savedLength = symbols.length
      scopeStart = savedLength
      fn.params.forEach(param => symbols.push({ name: param }))
      fn.body.forEach(walkNode)
      symbols.length = savedLength
      scopeStart = 0
   }

   function findSymbol(name: string) {
      for (let i = symbols.length - 1; i >= 0; i--) {
         if (symbols[i].name === name) return symbols[i]
      }
      return undefined
   }

   function checkDeclared(name: string) {
      if (!symbols.some(s => s.name === name)) {
         errors.push({ type: 'semantic', message: `Variable '${name}' is not declared` })
      }
   }

   function checkRedeclared(name: string) {
      if (symbols.slice(scopeStart).some(s => s.name === name)) {
         errors.push({ type: 'semantic', message: `Variable '${name}' is already declared` })
      }
   }

   function checkTypeConsistency(name: string, valueType: ValueType | undefined, declaredType: ValueType | undefined) {
      if (declaredType && valueType && valueType !== declaredType) {
         errors.push({ type: 'semantic', message: `Cannot assign ${valueType} value to variable '${name}' of type ${declaredType}` })
      }
   }

   function checkArrayInScalarContext(node: atype.Node | undefined) {
      if (!node || node.name !== 'IdentifierNode') return
      const sym = findSymbol(node.value!)
      if (sym?.type === 'array') {
         errors.push({ type: 'semantic', message: `Array variable '${sym.name}' used without index` })
      }
   }

   // Register functions first so they can be called before their definition
   program.body.forEach(node => {
      if (node.name !== 'FunctionDefNode') return
      if (functions.has(node.identifier)) {
         errors.push({ type: 'semantic', message: `Function '${node.identifier}' is already defined` })
      }
      functions.set(node.identifier, node)
   })

   // Walk the main program first, so functions can see its global variables
   program.body.filter(node => node.name !== 'FunctionDefNode').forEach(walkNode)
   program.body.forEach(node => {
      if (node.name === 'FunctionDefNode') walkFunction(node)
   })
   return errors
}