# Pseudocode Convention (VCAA)

Source: https://www.vcaa.vic.edu.au/curriculum/vce-curriculum/vce-study-designs/pseudocode
Retrieved: 2026-09-30. Full page content below. Web extraction glitches (split words, broken maths markup, displaced footnotes) have been cleaned up. The source's own wording, and any errors in it, are kept as published.

All pseudocode files (`*.pff`) in this folder must follow this convention.

## Quick rules

- One statement per line.
- Indentation shows hierarchy (loops, decisions).
- End nested blocks with an end keyword: `end if`, `end for`, `end while`.
- Assignment uses `←` (e.g. `x ← x + 1`).
- Decisions: `if … then` / `else if … then` / `else` / `end if`.
- Loops: `for i from 1 to n` … `end for` (inclusive range); `while condition` … `end while`.
- Functions: `define name(inputs):` … `return output`. The whole body, including `return`, is indented one level under `define` (house rule; see the Functions section).
- Input and output keywords: `input`, `print`, `return`.
- Algorithms: `Algorithm: <title>` starts a process; everything after it, up to the next
  `Algorithm:` or `define`, is its flow. Each algorithm is its own flowchart (house rule).
- `define` is only for reusable functions called from an algorithm. Functions are not charted.
- Random real numbers: `random real number from a (inclusive) to b (exclusive)`.

## Instructor rules (Thomas Nobes), which apply on top of VCAA

Source: `Thomas Nobes_review.md` in this folder. Where it differs from VCAA, these rules win.

1. **Use `==` for equality checks**, even though assignment uses `←`.
2. **Define inputs and outputs at the top** of each piece of pseudocode: say what each symbol means and what values it can take (e.g. "Input: array A of size n…").
3. **Comment only the important lines**: skip comments that just repeat obvious syntax.
4. **No hardcoding**: the generator, heap, array and experiment runner take parameters or named settings, and functions are passed in as inputs.
5. **Remove AI or translation leftovers by hand**: the work must be your own.

## Rules PseudoFlow reads

PseudoFlow reads the `convention` blocks in this section; everything else in this file is for people. To change what PseudoFlow accepts, change a block here and its sentence next to it. `npm test` then checks every example in this file still parses.

Block format: YAML. Each top-level key appears in one block only. Write phrases in single quotes.

### Symbols

Maths symbols and upper-case words are read as PseudoFlow's own spelling: `a ≠ b` is `a != b`, `x mod 2` is `x % 2`, and the dashes `–` and `−` are minus. Assignment is `←` or `=`.

```convention
assignment: ['←', '=']
symbols:
  '≠': '!='
  '≤': '<='
  '≥': '>='
  '×': '*'
  '÷': '/'
  '{': '('
  '}': ')'
  'mod': '%'
  'MOD': '%'
  '–': '-'
  '−': '-'
```

### Words and line shapes

- `and`, `or`, `not` may be written in capitals.
- A block may be closed with two words: `end if`, `end for` (`fin` is the Spanish form).
- The letter `x` between two values on one line means times: `product x i`.
- A run of superscript digits is a power: `i²`, `10⁷`.
- `(1, key)` in brackets is a tuple, kept as a list.
- `return a, b` returns several values as one tuple, the same as `return (a, b)`.
- Without `enddefine`, a function ends where the indentation returns to the level of `define`.

```convention
words:
  upperCaseLogic: true
  endPrefixes: [end, fin]
  letterTimes: x
  superscriptPowers: true
  bracketTuples: true
  returnTuple: true
  defineEndsByIndent: true
```

### Headings

A heading is a word followed by `:` at the start of a line. `chart` starts an algorithm that gets its own flowchart; `skip` is a description only. Case does not matter.

```convention
headings:
  Algorithm: chart
  Input: skip
  Output: skip
```

### Commands

Statements that start with a plain word. `open f for reading|writing`, `close f`, `append v to list`, `report v`. `read next <kind> from f` reads from a file.

```convention
commands: [open, close, append, report]
fileRead:
  kinds: [integer, number, line, word]
```

### Phrases

Phrases are written in words and read as a value. PseudoFlow tries them in order and the first match wins, so the more specific form goes first.

- `{name}` is a value; the value ends at the next word of the phrase.
- `[...]` is optional; `a|b` accepts either word; `\[` and `\]` are literal brackets.
- After `->` is what the phrase means.

```convention
phrases:
  - 'random integer from {low} to {high} exclusive -> randominteger(low, high - 1)'
  - 'random integer from {low} to {high} [inclusive] -> randominteger(low, high)'
  - 'random real [number] from {low} [(inclusive)] to {high} [(exclusive)] -> randomreal(low, high)'
  - 'an integer drawn uniformly at random from \[{low}, {high}\] -> randominteger(low, high)'
  - 'empty list|array -> []'
  - 'new list|array indexed from {low} to {high} -> []'
  - 'new list|array of size {size} -> []'
  - 'new list|array -> []'
```

Bounds can be names as well as numbers:

```
a ← 0
b ← 1
r ← random real number from a (inclusive) to b (exclusive)
print r
```

### Built-in functions

Functions every program can call, with their number of inputs. `randominteger(a, b)` is a whole number from `a` to `b`, inclusive; `randomreal(a, b)` is a real number from `a` (inclusive) to `b` (exclusive).

```convention
builtins:
  randominteger: 2
  randomreal: 2
```

---

## Pseudocode

## Introduction

Pseudocode is a tool for representing algorithms without the use of a particular programming language and related syntax.

It is written in a combination of plain English and common symbols, and describes, in a detailed step-by-step manner, the processes used in the algorithm.

There are some basic principles to be followed in using pseudocode which include:

- Have only one statement per line.
- Use indentation to show the hierarchy of processes within an algorithm such as repeating sections and conditional decisions.
- End nested processes with an end keyword (**end if**, **end while**).

### The constructs of pseudocode

#### Entering values into an algorithm

Values can be entered into an algorithm as part of the algorithm name or as **input** within the algorithm.

#### Assigning values to variables

A variable is a string of one or more letters that acts as a placeholder that can be assigned different values. For example:

`x ← 5` means ‘assign the value 5 to the variable x’.

`product ← 3` means ‘assign the value 3 to the variable product’.

`x ← x + 1` means ‘assign the value x + 1 to the variable x’.

#### Decisions in pseudocode

**if – then blocks** provide a means of making decisions within an algorithm. Certain instructions are only followed if a condition is true.

```template
if condition is true then
    follow these instructions
end if
```

We can expand this process by specifying alternative instructions if the condition is false.

```template
if condition is true then
    follow these instructions
else
    follow these instructions
end if
```

#### An example for finding the smaller of two numbers a and b.

```
Algorithm: minimum of two numbers
input a, b
if a ≤ b then
    print a
else
    print b
end if
```

Further decisions can be added inside if – then blocks to include more conditions are nested (indented) within the previous block.

```template
if first condition is true then
    follow these instructions
else if second condition is true then
    follow these instructions
else
    follow these instructions
end if
```

#### Repetition

Loops are used to repeat a process. How many repetitions (iterations) take place is controlled by either specifying and counting the number of times (a **for** loop) or by specifying a condition which must be met for the process to continue, otherwise it ends (a **while** loop). An example of each of these approaches is shown below:

**For loops** provide a means of repeatedly executing the same set of instructions in a controlled way. A counter (i) is increased by one, each time through the loop.

```template
for i from 1 to n
    follow these instructions
end for
```

**Note:** We will follow the convention that ‘from 1 to n’ is inclusive. For example: for i from 1 to 3, i takes values 1, 2 and 3.

**Algorithm**: First 5 perfect squares

```
for i from 1 to 5
    print i²
end for
```

**While loops** provide another means of repeatedly executing the same set of instructions in a controlled way. This is achieved by performing iterations as long as some condition remains true.

```template
while condition is true
    follow these instructions
end while
```

**Algorithm**: Perfect squares less than 1000

```
x ← 1
while x² < 1000
    x ← x + 1
    print (x - 1)²
end while
```

### Functions

Are sections of pseudocode that can be used to complete a specific task. Once a function is defined, it can be used (called) within another algorithm. A function takes one or more input values and returns an output value.

```template
define function_name (input for function):
    follow these instructions
return output
```

```
define factorial (n):
    product ← 1
    for i from 1 to n
        product ← product x i
    end for
return product
```

> **House rule (not from VCAA):** VCAA is inconsistent here. The two examples above put `return` back at the `define` level, but the trapezium example indents it (`define f(x)` → indented `return`). In our pseudocode, **indent the whole function body, including `return`, one level under `define`**. With no `end define` keyword, indentation is the only thing that shows where a function ends.

### Examples

#### Numerical integration using trapezium method

#### Algorithm

```
define f(x)
    return (enter required function rule)

sum ← 0
a ← lowest x-value
b ← highest x-value
n ← number of trapeziums
h ← (b - a)/n
left ← a
right ← a + h
for i from 1 to n
    strip ← 0.5(f(left) + f(right)) x h
    sum ← sum + strip
    left ← left + h
    right ← right + h
end for
print sum
```

#### Comments

The trapezium method algorithm gives an approximation of ∫ₐᵇ f(x) dx.
The function being considered is first defined.
For example, f(x) = x², choose a = 1 and b = 4 to approximate ∫₁⁴ x² dx.
n is the number of trapeziums chosen.
In the for **loop** the area of each trapezium is calculated as you move from left to right and added to sum.
The final value of sum is printed.

The trapezium algorithm may be implemented by using a function structure.
The function f must be defined first.

```template
define Trap(a, b, n)
    (Insert algorithm as shown)
    return (sum)
```

The advantage of this is that it may be implemented simply by changing the values of the variables.

#### Estimate of the long-term average for the number of rolls to get a six

#### Algorithm

```
sum ← 0
for i from 1 to 1000
    outcome ← 0
    count ← 0
    while outcome ≠ 6
        outcome ← randominteger(1, 6)
        count ← count + 1
    end while
    sum ← sum + count
end for
print sum/1000
```

#### Comments

Many devices have a random number function. We use the function: randominteger(1, 6) to return one of the numbers 1,2,3,4,5,6 randomly.

The **while** loop continues until the value 6 is given by randominteger(1, 6). The variable count gives the number of iterations before a 6.

The **for** loop repeats this 1000 times. The variable sum gives the total of the 1000 values of count.

The **print** statement is for the average.

#### Bisection Method for finding x-intercepts

#### Algorithm

```
define f(x)
    return (enter required function rule)

a ← lower guess
b ← upper guess
c ← (a + b)/2
t ← tolerance
if f(a) × f(b) > 0 then
    print "Incorrect initial guesses"
else
    while b - a > 2 × t
        if f(a) × f(c) < 0 then
            b ← c
        else
            a ← c
        end if
        c ← (a + b)/2
    end while
    print(c)
end if
```

#### Comments

Function f(x) is chosen.
For example:

```
define f(x)
    return x² – 2
```

Good choices for a and b are a = 1 and a = 2. (f(1) f(2) > 0.)

If this is the choice we go to the **else** section of the algorithm and the outer **if** statement has done its job.

The **while** loops requires that we continue the iteration until the desired accuracy is reached.

The **if** statement inside the algorithm ensures that we continue to choose values for which there is a sign difference. For each iteration an average of the new pair is determined by the **if** statement is calculated.

#### Euler’s method for differential equations

Consider a differential equation dy/dx = f(x, y).

Define a function euler(x₀, y₀, h, xfin) where h is the step size and xfin is the value at which we want to approximately solve the differential equation.

#### Algorithm

```
define function(x, y)
    return (enter required function rule)

define euler(x₀, y₀, h, xfin)
    y ← y₀
    x ← y₀
    while x < xfin
        y ← y + h × f(x, y)
        x ← x + h
    end while
    return (xfin, y)
```

#### Comments

The differential equation is dy/dx = f(x, y).

For example f(x, y) = xy.

x₀ is the initial x value and h₀ the corresponding y value. Let h = 0.1.

If you start at (1,2) the next ordered pair is (1.1, 2.2) and the following (1.2, 2.442).

The iteration continue for the required number of iterations.

## Content from the areas of study where pseudocode can be used

### Mathematical Methods

- piecewise defined functions
- bisection (and using the mean of the endpoints as a point estimate)
- numerical evaluation of limits for derivatives
- Newton’s method for polynomials (Units 1 and 2) and other functions (Units 3 and 4)
- Polynomial approximations to transcendental functions
- Counting in a probability context
- Simple simulations for probability
- Optimisation of integer valued functions
- Simulations for sampling distributions, central limit theorem
- Numerical integration, left and right interval values, trapezium method point estimate

### Specialist Mathematics

- Investigation of number properties, sequences, partial sums and products
- Numerical integration – Reimann sums for areas, volumes and surface areas of solids of revolution, length of segments of a curve
- Vector operations including scalar product, cross product, projections
- Numerical solution of differential equations including Euler’s method
- Sums of random variables
- Sample distributions for means

### Sample Questions

**1.** The algorithm shown on the right will print the value

```
a ← 2
while a < 20
    a ← 2a
end while
print (a)
```

A 16 · B 24 · C 28 · D 30 · E 32 — **Answer: E**

**2.** The algorithm shown on the right will print the value

```
sum ← 2
for x from 1 to 3
    for y from 1 to 2
        sum = sum + x + y
    end for
end for
print(sum)
```

A 15 · B 17 · C 19 · D 21 · E 23 — **Answer: E**

**3.** For the algorithm shown opposite, the value of c when count = 3, is

```
define f(x)
    return (2eˣ – 17)

a ← 2
b ← 3
c ← (a + b)/2
count = 0
while b - a > 0.002
    count = count + 1
    if f(a) × f(c) < 0 then
        b ← c
    else
        a ← c
    end if
    c ← (a + b)/2
end while
```

A 2.125 · B 2.15625 · C 2.1875 · D 2.25 · E 2.5 — **Answer: C**

**4.** Three dice are rolled at the same time. The algorithm shown opposite generates the sample space for this experiment. The print statement when count = 4 gives (4, x). The value of x is

```
count ← 0
for i from 1 to 6
    for j from 1 to 6
        for k from 1 to 6
            count ← count + 1
            print (count, i + j + k)
        end for
    end for
end for
```

A 4 · B 5 · C 6 · D 7 · E 8 — **Answer: C**

**5 a** For the code opposite give the resulting printout.

```
for i from 1 to 4
    print i³ + 2
end for
```

**5 b** For the code opposite give the resulting printout.

```
for i from 1 to 5
    if i² < 10
        print i²
    else
        print i² + 2
    end if
end for
```

**6.** The surface area, S, of a rectangular prism box with the top open and fixed volume V, is given by S = xy + 2V/x + 2V/y where the side lengths take only integer values. Assume x and y are the side lengths of the base of the box.

For a given value of V, describe the algorithm using pseudocode to find the integer valued side lengths that maximise the surface area of the box.
