module Ast {

  export type Node = Atom | Seq | Alt | Star;

  export class Atom {
    public k: 'atom' = 'atom';
    constructor(public v: string/* either one character or zero characters (epsilon)*/) { }
  }

  export class Seq {
    public k: 'seq' = 'seq';
    constructor(public v: Node[]) { }
  }

  export class Alt {
    public k: 'alt' = 'alt';
    constructor(public v: Node[]) { }
  }

  export class Star {
    public k: 'star' = 'star';
    constructor(public v: Node) { }
  }

}

module Nfa {

  export class Node {
    public ds = new Array<Edge>(); // desendants
  }

  export class Edge {
    constructor(public v: string, // value
      public t: Node, // target
    ) { }
  }

}

let success = test([{
  regex: 'a(b|c)d*',
  shouldMatch: ['acd', 'abd', 'acdddd', 'abdddd', 'ac', 'ab'],
  shouldFail: ['a', 'bab', 'abc', '', 'adc'],
}, {
  regex: '(|a)',
  shouldMatch: ['a', ''],
  shouldFail: ['aa', 'b'],
}, {
  regex: '(|a)(b|c*)',
  shouldMatch: ['ab', 'a', '', 'b', 'cccccc', 'c', 'cc', 'ac', 'accc'],
  shouldFail: ['aa', 'abb', 'abc', 'bc', 'ca'],
}]);


function test(values: { regex: string, shouldMatch: string[], shouldFail: string[] }[]): boolean {
  let success = true;
  for (let testCase of values) {
    let ast = parse(testCase.regex);
    let nfa = makeNfa(ast);

    for (let v of testCase.shouldMatch) {
      if (!match(nfa, v)) {
        console.log(`Failed: "${v}" should match "${testCase.regex}"`);
        success = false;
      }
    }
    for (let v of testCase.shouldFail) {
      if (match(nfa, v)) {
        console.log(`Failed: "${v}" should NOT match "${testCase.regex}"`);
        success = false;
      }
    }
  }
  console.log(success ? 'All tests succeeded' : 'Some tests failed');
  return success;
}

function parse(s: string) {
  s = s + ')';
  let [lastPosition, node] = p(0);
  if (lastPosition !== s.length - 1) {
    throw 'not everything consumed';
  }
  return simplify(node);

  function p(i: number): [number, Ast.Node] {
    let node: Ast.Node | null = null;
    let seq = new Ast.Seq([]);
    let alt = new Ast.Alt([seq]);
    while (i < s.length) {
      let c = s.charAt(i);
      if (c === '(') {
        [i, node] = p(i + 1);
        seq.v.push(node);
      } else if (c === ')') {
        if (alt.v.length > 1) {
          return [i, alt];
        } else if (seq.v.length > 1) {
          return [i, seq];
        } else if (node !== null) {
          return [i, node];
        } else {
          throw 'empty parens';
        }
      } else if (c === '*') {
        if (node !== null) {
          node = new Ast.Star(node);
          seq.v[seq.v.length - 1] = node;
        } else {
          throw 'star without thing';
        }
      } else if (c === '|') {
        seq = new Ast.Seq([]);
        alt.v.push(seq);
      } else {
        node = new Ast.Atom(c);
        seq.v.push(node);
      }
      i++;
    }
    throw 'termination too early';
  }

  function simplify(node: Ast.Node): Ast.Node {
    if (node.k === 'seq') {
      let newV = new Array<Ast.Node>();
      for (let c of node.v) {
        newV.push(simplify(c));
      }
      node = new Ast.Seq(newV);
      if (node.v.length === 1) {
        return simplify(node.v[0]);
      } else if (node.v.length === 0) {
        return new Ast.Atom('');
      } else {
        return node;
      }
    } else if (node.k === 'alt') {
      let newV = new Array<Ast.Node>();
      for (let c of node.v) {
        newV.push(simplify(c));
      }
      return new Ast.Alt(newV);
    } else if (node.k === 'star') {
      node = new Ast.Star(simplify(node.v));
      if (node.v.k === 'star') {
        return node.v.v;
      } else {
        return node;
      }
    } else if (node.k === 'atom') {
      return node;
    } else {
      throw 'unexpected ast type';
    }
  }
}

function makeNfa(ast: Ast.Node): Nfa.Node {

  let startNode = new Nfa.Node();
  makeEdge(ast, startNode, new Nfa.Node());
  return startNode;

  function makeEdge(ast: Ast.Node, start: Nfa.Node, end: Nfa.Node) {
    if (ast.k === 'seq') {
      let last = start;
      let nextNodes = range(ast.v.length - 1).map(_ => new Nfa.Node()).concat([end]);
      for (let [astChild, next] of zip(ast.v, nextNodes)) {
        makeEdge(astChild, last, next);
        last = next;
      }
    } else if (ast.k === 'alt') {
      for (let n of ast.v) {
        makeEdge(n, start, end);
      }
    } else if (ast.k === 'star') {
      let middle = new Nfa.Node();
      start.ds.push(new Nfa.Edge('', middle));
      makeEdge(ast.v, middle, middle);
      middle.ds.push(new Nfa.Edge('', end));
    } else if (ast.k === 'atom') {
      start.ds.push(new Nfa.Edge(ast.v, end));
    }
  }
}

function match(startNode: Nfa.Node, str: string): boolean {
  let ns = new Set<Nfa.Node>()
  addNodeToSet(ns, startNode);
  for (let c of str) {
    let newNs = new Set<Nfa.Node>();
    for (let n of ns) {
      for (let e of n.ds) {
        if (c === e.v) {
          addNodeToSet(newNs, e.t);
        }
      }
    }
    ns = newNs;
  }
  for (let n of ns) {
    if (n.ds.length === 0) { // only end node has no desendants
      return true;
    }
  }
  return false;
  function addNodeToSet(set: Set<Nfa.Node>, n: Nfa.Node) {
    if (!set.has(n)) {
      set.add(n);
      for (let e of n.ds) {
        if (e.v === '') {
          addNodeToSet(set, e.t);
        }
      }
    }
  }
}

function* zip<T, U>(seq1: T[], seq2: U[]): IterableIterator<[T, U]> {
  for (let i = 0; i < seq1.length && i < seq2.length; i++) {
    yield [seq1[i], seq2[i]];
  }
}

function range(end: number): number[] {
  let res = new Array<number>();
  for (let i = 0; i < end; i++) {
    res.push(i);
  }
  return res;
}
