type Value = string | number | boolean | undefined
interface Cell { value: Value; formula?: string }
type Argument = Value | Value[]

const reference = /^\$?[A-Z]{1,3}\$?\d+$/i
const keyFor = (key: string) => key.toUpperCase().replaceAll('$', '')
const getColumn = (key: string) => [...key.replace(/\d/g, '')].reduce((column, character) => column * 26 + character.charCodeAt(0) - 64, 0)
const getRow = (key: string) => Number(key.replace(/[A-Z]/g, ''))
const columnName = (column: number): string => column <= 26 ? String.fromCharCode(64 + column)
  : columnName(Math.floor((column - 1) / 26)) + columnName((column - 1) % 26 + 1)
const numeric = (value: Value) => typeof value === 'boolean' ? Number(value) : Number(value ?? 0)

function evaluate(expression: string, resolve: (key: string) => Value): Value {
  const scanner = /\s*(\$?[A-Z]{1,3}\$?\d+\b|[A-Z_][A-Z_.0-9]*|\d+(?:\.\d*)?(?:E[+-]?\d+)?|\.\d+(?:E[+-]?\d+)?|"(?:[^"]|"")*"|<>|<=|>=|[(),:+*/^%=<>-])/iy
  const input = expression.replace(/^=/, '').trim()
  if (input.length > 4096) return undefined
  const tokens: string[] = []
  while (scanner.lastIndex < input.length) {
    const token = scanner.exec(input)?.[1]
    if (!token || tokens.length >= 512) return undefined
    tokens.push(token)
  }
  if (!tokens.length) return undefined
  let cursor = 0
  const read = () => tokens[cursor++]
  const require = (expected: string) => {
    if (read() !== expected) throw new Error('Invalid formula')
  }
  const scalar = (argument: Argument): Value => {
    if (Array.isArray(argument)) throw new Error('Expected a value')
    return argument
  }

  function range(start: string, finish: string) {
    const from = keyFor(start), to = keyFor(finish)
    const rows = [getRow(from), getRow(to)].sort((a, b) => a - b)
    const columns = [getColumn(from), getColumn(to)].sort((a, b) => a - b)
    if ((rows[1] - rows[0] + 1) * (columns[1] - columns[0] + 1) > 10000) throw new Error('Range too large')
    const results: Value[] = []
    for (let row = rows[0]; row <= rows[1]; row++) for (let column = columns[0]; column <= columns[1]; column++) {
      results.push(resolve(columnName(column) + row))
    }
    return results
  }
  function call(name: string, args: Argument[]): Value {
    const filled = args.flat().filter(value => value !== undefined && value !== '')
    const numbers = filled.filter((value): value is number => typeof value === 'number')
    switch (name.toUpperCase()) {
      case 'SUM': return numbers.reduce((sum, value) => sum + value, 0)
      case 'AVERAGE': return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
      case 'MIN': return numbers.length ? Math.min(...numbers) : 0
      case 'MAX': return numbers.length ? Math.max(...numbers) : 0
      case 'COUNT': return numbers.length
      case 'COUNTA': return filled.length
      case 'IF': return scalar(args[0]) ? scalar(args[1]) : scalar(args[2])
      case 'ROUND': {
        const places = numeric(scalar(args[1]))
        if (Math.abs(places) > 100) return undefined
        const power = 10 ** places
        const number = numeric(scalar(args[0]))
        return Math.sign(number) * Math.round(Math.abs(number) * power) / power
      }
      default: throw new Error('Unsupported formula')
    }
  }
  function atom(): Argument {
    const token = read()
    if (!token) throw new Error('Missing value')
    if (token === '(') {
      const value = comparison()
      require(')')
      return value
    }
    if (token.startsWith('"')) return token.slice(1, -1).replaceAll('""', '"')
    if (!Number.isNaN(Number(token))) return Number(token)
    if (reference.test(token)) {
      if (tokens[cursor] === ':') {
        cursor++
        const finish = read()
        if (!reference.test(finish ?? '')) throw new Error('Invalid range')
        return range(token, finish)
      }
      return resolve(keyFor(token))
    }
    if (token.toUpperCase() === 'TRUE' || token.toUpperCase() === 'FALSE') return token.toUpperCase() === 'TRUE'
    if (tokens[cursor] === '(') {
      cursor++
      const args: Argument[] = []
      if (tokens[cursor] !== ')') {
        args.push(comparison())
        while (tokens[cursor] === ',') { cursor++; args.push(comparison()) }
      }
      require(')')
      return call(token, args)
    }
    throw new Error('Invalid token')
  }
  function power(): Argument {
    const token = tokens[cursor]
    if (token === '-' || token === '+') {
      cursor++
      return (token === '-' ? -1 : 1) * numeric(scalar(power()))
    }
    let value = atom()
    if (tokens[cursor] === '%') {
      cursor++
      value = numeric(scalar(value)) / 100
    }
    if (tokens[cursor] === '^') {
      cursor++
      value = numeric(scalar(value)) ** numeric(scalar(power()))
    }
    return value
  }
  function product(): Argument {
    let value = power()
    while (tokens[cursor] === '*' || tokens[cursor] === '/') {
      const operation = read()
      const next = numeric(scalar(power()))
      value = operation === '*' ? numeric(scalar(value)) * next : numeric(scalar(value)) / next
    }
    return value
  }
  function sum(): Argument {
    let value = product()
    while (tokens[cursor] === '+' || tokens[cursor] === '-') {
      const operation = read()
      const next = numeric(scalar(product()))
      value = operation === '+' ? numeric(scalar(value)) + next : numeric(scalar(value)) - next
    }
    return value
  }
  function comparison(): Argument {
    const first = sum()
    const operator = tokens[cursor]
    if (!['=', '<>', '<', '>', '<=', '>='].includes(operator)) return first
    cursor++
    const a = scalar(first), b = scalar(sum())
    switch (operator) {
      case '=': return a === b
      case '<>': return a !== b
      case '<': return numeric(a) < numeric(b)
      case '>': return numeric(a) > numeric(b)
      case '<=': return numeric(a) <= numeric(b)
      default: return numeric(a) >= numeric(b)
    }
  }
  const answer = scalar(comparison())
  if (cursor !== tokens.length || typeof answer === 'number' && !Number.isFinite(answer)) return undefined
  return answer
}

export function calculateCells(cells: Map<string, Cell>) {
  const active = new Set<string>()
  const calculated = new Map<string, Value>()
  function resolve(key: string): Value {
    const cell = cells.get(key)
    if (cell?.value !== undefined || !cell?.formula) return cell?.value
    if (active.has(key) || active.size > 64) throw new Error('Circular or deep reference')
    if (calculated.has(key)) return calculated.get(key)
    active.add(key)
    try {
      const value = evaluate(cell.formula, resolve)
      if (value === undefined) throw new Error('Formula unavailable')
      calculated.set(key, value)
      return value
    } finally {
      active.delete(key)
    }
  }
  return (key: string): Value => {
    try { return resolve(key) } catch { return undefined }
  }
}
