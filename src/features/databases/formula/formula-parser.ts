// Formulas in Notion's syntax (decision of the user, CLAUDE.md §12 P14f):
// prop("Preis") * prop("Menge"), if(prop("Erledigt"), "✓", "offen").
// A small recursive descent parser; formulas are never run as JavaScript.

export const MAX_EXPRESSION_LENGTH = 2000;
export const NO_FORMULA_MESSAGE = "Noch keine Formel.";
const MAX_NESTING = 50;

/** A problem in a formula, with a message for the user. */
export class FormulaError extends Error {}

export type BinaryOperator = "+" | "-" | "*" | "/" | "%" | "^" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "and" | "or";

export type FormulaNode =
    | { kind: "number"; value: number }
    | { kind: "string"; value: string }
    | { kind: "boolean"; value: boolean }
    | { kind: "prop"; name: string }
    | { kind: "call"; name: string; args: FormulaNode[] }
    | { kind: "unary"; operator: "-" | "not"; operand: FormulaNode }
    | { kind: "binary"; operator: BinaryOperator; left: FormulaNode; right: FormulaNode }
    | { kind: "conditional"; condition: FormulaNode; then: FormulaNode; otherwise: FormulaNode };

type Token =
    | { type: "number"; value: number; at: number }
    | { type: "string"; value: string; at: number }
    | { type: "name"; value: string; at: number }
    | { type: "symbol"; value: string; at: number }
    | { type: "end"; at: number };

// Longest first, so "<=" is not read as "<" and "=".
const SYMBOLS = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "%", "^", "<", ">", "!", "(", ")", ",", "?", ":"];

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    while (index < source.length) {
        const char = source[index];
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }
        if (/[0-9.]/.test(char)) {
            const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(index));
            if (!match) throw new FormulaError(`Unerwartetes Zeichen „${char}“ an Stelle ${index + 1}.`);
            tokens.push({ type: "number", value: Number(match[0]), at: index });
            index += match[0].length;
            continue;
        }
        if (char === '"') {
            let value = "";
            let end = index + 1;
            while (end < source.length && source[end] !== '"') {
                if (source[end] === "\\" && end + 1 < source.length) {
                    const escaped = source[end + 1];
                    value += escaped === "n" ? "\n" : escaped;
                    end += 2;
                } else {
                    value += source[end];
                    end += 1;
                }
            }
            if (end >= source.length) throw new FormulaError(`Text ab Stelle ${index + 1} wird nicht mit " beendet.`);
            tokens.push({ type: "string", value, at: index });
            index = end + 1;
            continue;
        }
        if (/[A-Za-z_]/.test(char)) {
            const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
            const name = match ? match[0] : char;
            tokens.push({ type: "name", value: name, at: index });
            index += name.length;
            continue;
        }
        const symbol = SYMBOLS.find((candidate) => source.startsWith(candidate, index));
        if (!symbol) {
            const hint = char === "=" ? " Für Vergleiche bitte == schreiben." : "";
            throw new FormulaError(`Unerwartetes Zeichen „${char}“ an Stelle ${index + 1}.${hint}`);
        }
        tokens.push({ type: "symbol", value: symbol, at: index });
        index += symbol.length;
    }
    tokens.push({ type: "end", at: source.length });
    return tokens;
}

function describe(token: Token): string {
    if (token.type === "end") return "das Ende";
    if (token.type === "string") return `Text "${token.value}"`;
    return `„${token.value}“`;
}

class Parser {
    private readonly tokens: Token[];
    private position = 0;
    private depth = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): FormulaNode {
        const node = this.expression();
        const rest = this.peek();
        if (rest.type !== "end") throw new FormulaError(`Unerwartet: ${describe(rest)} an Stelle ${rest.at + 1}.`);
        return node;
    }

    private peek(): Token {
        return this.tokens[this.position];
    }

    private next(): Token {
        const token = this.tokens[this.position];
        if (token.type !== "end") this.position += 1;
        return token;
    }

    private isSymbol(...symbols: string[]): boolean {
        const token = this.peek();
        return token.type === "symbol" && symbols.includes(token.value);
    }

    private isKeyword(keyword: string): boolean {
        const token = this.peek();
        return token.type === "name" && token.value === keyword;
    }

    private expect(symbol: string) {
        const token = this.next();
        if (token.type !== "symbol" || token.value !== symbol) {
            throw new FormulaError(`„${symbol}“ erwartet, gefunden: ${describe(token)} an Stelle ${token.at + 1}.`);
        }
    }

    // Lowest precedence first: ?:, or, and, ==/!=, </>, +/-, */%, unary, ^.
    private expression(): FormulaNode {
        this.depth += 1;
        if (this.depth > MAX_NESTING) throw new FormulaError("Die Formel ist zu tief verschachtelt.");
        const condition = this.or();
        let node = condition;
        if (this.isSymbol("?")) {
            this.next();
            const then = this.expression();
            this.expect(":");
            const otherwise = this.expression();
            node = { kind: "conditional", condition, then, otherwise };
        }
        this.depth -= 1;
        return node;
    }

    private or(): FormulaNode {
        let node = this.and();
        while (this.isKeyword("or") || this.isSymbol("||")) {
            this.next();
            node = { kind: "binary", operator: "or", left: node, right: this.and() };
        }
        return node;
    }

    private and(): FormulaNode {
        let node = this.equality();
        while (this.isKeyword("and") || this.isSymbol("&&")) {
            this.next();
            node = { kind: "binary", operator: "and", left: node, right: this.equality() };
        }
        return node;
    }

    private binaryLevel(operators: BinaryOperator[], operand: () => FormulaNode): FormulaNode {
        let node = operand();
        for (;;) {
            const token = this.peek();
            const operator = token.type === "symbol" ? operators.find((candidate) => candidate === token.value) : undefined;
            if (!operator) return node;
            this.next();
            node = { kind: "binary", operator, left: node, right: operand() };
        }
    }

    private equality(): FormulaNode {
        return this.binaryLevel(["==", "!="], () => this.comparison());
    }

    private comparison(): FormulaNode {
        return this.binaryLevel(["<", "<=", ">", ">="], () => this.additive());
    }

    private additive(): FormulaNode {
        return this.binaryLevel(["+", "-"], () => this.multiplicative());
    }

    private multiplicative(): FormulaNode {
        return this.binaryLevel(["*", "/", "%"], () => this.unary());
    }

    private unary(): FormulaNode {
        if (this.isSymbol("-")) {
            this.next();
            return { kind: "unary", operator: "-", operand: this.unary() };
        }
        if (this.isSymbol("!") || this.isKeyword("not")) {
            this.next();
            return { kind: "unary", operator: "not", operand: this.unary() };
        }
        return this.power();
    }

    // -2 ^ 2 is -(2 ^ 2), and ^ groups to the right, like in mathematics.
    private power(): FormulaNode {
        const base = this.primary();
        if (!this.isSymbol("^")) return base;
        this.next();
        return { kind: "binary", operator: "^", left: base, right: this.unary() };
    }

    private primary(): FormulaNode {
        const token = this.next();
        switch (token.type) {
            case "number":
                return { kind: "number", value: token.value };
            case "string":
                return { kind: "string", value: token.value };
            case "symbol":
                if (token.value === "(") {
                    const node = this.expression();
                    this.expect(")");
                    return node;
                }
                break;
            case "name":
                if (token.value === "true" || token.value === "false") {
                    return { kind: "boolean", value: token.value === "true" };
                }
                if (this.isSymbol("(")) return this.call(token.value, token.at);
                throw new FormulaError(
                    `„${token.value}“ an Stelle ${token.at + 1} ist unbekannt. Eigenschaften schreibt man als prop("${token.value}").`,
                );
        }
        throw new FormulaError(`Unerwartet: ${describe(token)} an Stelle ${token.at + 1}.`);
    }

    private call(name: string, at: number): FormulaNode {
        this.expect("(");
        const args: FormulaNode[] = [];
        if (!this.isSymbol(")")) {
            args.push(this.expression());
            while (this.isSymbol(",")) {
                this.next();
                args.push(this.expression());
            }
        }
        this.expect(")");
        if (name !== "prop") return { kind: "call", name, args };
        // A fixed name, so dependencies between formulas are known in advance.
        const [property] = args;
        if (args.length !== 1 || property.kind !== "string") {
            throw new FormulaError(`prop an Stelle ${at + 1} braucht genau einen Namen in Anführungszeichen, z. B. prop("Preis").`);
        }
        return { kind: "prop", name: property.value };
    }
}

/** The formula as a tree; throws a FormulaError with a German message. */
export function parseFormula(source: string): FormulaNode {
    if (source.length > MAX_EXPRESSION_LENGTH) {
        throw new FormulaError(`Die Formel ist länger als ${MAX_EXPRESSION_LENGTH} Zeichen.`);
    }
    if (!source.trim()) throw new FormulaError(NO_FORMULA_MESSAGE);
    return new Parser(tokenize(source)).parse();
}

