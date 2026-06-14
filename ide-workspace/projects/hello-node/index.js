// Hello World in Node.js
function greet(name) {
  return `Hello, ${name}!`;
}

function fibonacci(n) {
  const seq = [0, 1];
  for (let i = 2; i < n; i++) {
    seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
  }
  return seq.slice(0, n);
}

console.log(greet("World"));
console.log("Fibonacci(10):", fibonacci(10));
