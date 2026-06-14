# Hello World in Python
def greet(name: str) -> str:
    return f"Hello, {name}!"

def fibonacci(n: int) -> list[int]:
    """Return first n Fibonacci numbers."""
    seq = [0, 1]
    for i in range(2, n):
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

if __name__ == "__main__":
    print(greet("World"))
    print("Fibonacci(10):", fibonacci(10))
