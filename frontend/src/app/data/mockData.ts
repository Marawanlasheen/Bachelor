import { Lecture, Assignment } from '../types';

export const mockLectures: Lecture[] = [
  {
    id: 'lec1',
    title: 'Introduction to Java',
    description: 'Learn the basics of Java programming language',
    progress: 100,
    completed: true,
    duration: '45 min',
    pdfUrl: '/lectures/intro-to-java.pdf',
    subtopics: [
      { id: 'sub1', title: 'Java History & Features', description: 'Overview of Java language evolution' },
      { id: 'sub2', title: 'Setting Up Environment', description: 'Installing JDK and IDE setup' },
      { id: 'sub3', title: 'First Java Program', description: 'Hello World and basic syntax' },
    ],
  },
  {
    id: 'lec2',
    title: 'Object-Oriented Programming',
    description: 'Master OOP concepts in Java',
    progress: 100,
    completed: true,
    duration: '60 min',
    pdfUrl: '/lectures/oop-concepts.pdf',
    subtopics: [
      { id: 'sub4', title: 'Classes and Objects', description: 'Understanding classes, objects, and instances' },
      { id: 'sub5', title: 'Encapsulation', description: 'Data hiding and access modifiers' },
      { id: 'sub6', title: 'Constructors', description: 'Object initialization techniques' },
    ],
  },
  {
    id: 'lec3',
    title: 'Inheritance & Polymorphism',
    description: 'Advanced OOP principles',
    progress: 75,
    completed: false,
    duration: '55 min',
    pdfUrl: '/lectures/inheritance-polymorphism.pdf',
    subtopics: [
      { id: 'sub7', title: 'Inheritance Basics', description: 'Extending classes and code reuse' },
      { id: 'sub8', title: 'Method Overriding', description: 'Runtime polymorphism' },
      { id: 'sub9', title: 'Abstract Classes', description: 'Abstraction in Java' },
    ],
  },
  {
    id: 'lec4',
    title: 'Data Structures',
    description: 'Working with arrays, lists, and collections',
    progress: 40,
    completed: false,
    duration: '70 min',
    pdfUrl: '/lectures/data-structures.pdf',
    subtopics: [
      { id: 'sub10', title: 'Arrays', description: 'Fixed-size data structures' },
      { id: 'sub11', title: 'ArrayList', description: 'Dynamic arrays in Java' },
      { id: 'sub12', title: 'LinkedList', description: 'Node-based data structures' },
    ],
  },
  {
    id: 'lec5',
    title: 'Exception Handling',
    description: 'Error management in Java',
    progress: 0,
    completed: false,
    duration: '50 min',
    pdfUrl: '/lectures/exception-handling.pdf',
    subtopics: [
      { id: 'sub13', title: 'Try-Catch Blocks', description: 'Handling exceptions' },
      { id: 'sub14', title: 'Custom Exceptions', description: 'Creating your own exception classes' },
      { id: 'sub15', title: 'Finally Block', description: 'Cleanup operations' },
    ],
  },
  {
    id: 'lec6',
    title: 'File I/O Operations',
    description: 'Reading and writing files',
    progress: 0,
    completed: false,
    duration: '65 min',
    pdfUrl: '/lectures/file-io.pdf',
    subtopics: [
      { id: 'sub16', title: 'File Class', description: 'Working with file system' },
      { id: 'sub17', title: 'Reading Files', description: 'BufferedReader and Scanner' },
      { id: 'sub18', title: 'Writing Files', description: 'FileWriter and PrintWriter' },
    ],
  },
];

export const mockAssignments: Assignment[] = [
  {
    id: 'assign1',
    title: 'Java Fundamentals',
    description: 'Basic Java programming exercises',
    dueDate: '2026-04-15',
    progress: 100,
    pdfUrl: '/assignments/java-fundamentals.pdf',
    questions: [
      {
        id: 'q1',
        title: 'Hello World',
        description: 'Write a program that prints "Hello, World!" to the console.',
        difficulty: 'Easy',
        solved: true,
        solution: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
        chatHistory: [
          { id: 'c1', sender: 'user', message: 'How do I print in Java?', timestamp: Date.now() - 10000 },
          { id: 'c2', sender: 'ai', message: 'You can use System.out.println() to print to the console.', timestamp: Date.now() - 9000 },
        ],
        starterCode: `public class Main {
    public static void main(String[] args) {
        // Write your code here

    }
}`,
        examples: [
          {
            input: 'None',
            output: 'Hello, World!',
          },
        ],
      },
      {
        id: 'q2',
        title: 'Sum of Two Numbers',
        description: 'Write a program that takes two integers and returns their sum.',
        difficulty: 'Easy',
        solved: true,
        solution: `public class Main {
    public static int sum(int a, int b) {
        return a + b;
    }

    public static void main(String[] args) {
        System.out.println(sum(5, 3));
    }
}`,
        chatHistory: [],
        starterCode: `public class Main {
    public static int sum(int a, int b) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        System.out.println(sum(5, 3));
    }
}`,
        examples: [
          {
            input: 'a = 5, b = 3',
            output: '8',
          },
          {
            input: 'a = -2, b = 7',
            output: '5',
          },
        ],
      },
      {
        id: 'q3',
        title: 'Check Even or Odd',
        description: 'Write a method that checks if a number is even or odd.',
        difficulty: 'Easy',
        solved: true,
        solution: `public class Main {
    public static String checkEvenOdd(int num) {
        return num % 2 == 0 ? "Even" : "Odd";
    }

    public static void main(String[] args) {
        System.out.println(checkEvenOdd(4));
    }
}`,
        starterCode: `public class Main {
    public static String checkEvenOdd(int num) {
        // Write your code here
        return "";
    }

    public static void main(String[] args) {
        System.out.println(checkEvenOdd(4));
    }
}`,
        examples: [
          {
            input: 'num = 4',
            output: 'Even',
          },
          {
            input: 'num = 7',
            output: 'Odd',
          },
        ],
      },
    ],
  },
  {
    id: 'assign2',
    title: 'Object-Oriented Programming',
    description: 'Practice OOP concepts',
    dueDate: '2026-04-20',
    progress: 67,
    pdfUrl: '/assignments/oop-practice.pdf',
    questions: [
      {
        id: 'q4',
        title: 'Create a Student Class',
        description: 'Create a Student class with name, age, and GPA fields. Include getters, setters, and a method to display student info.',
        difficulty: 'Medium',
        solved: true,
        starterCode: `public class Student {
    // Define your fields here

    // Constructor

    // Getters and setters

    // Display method

}

public class Main {
    public static void main(String[] args) {
        Student student = new Student("John", 20, 3.5);
        student.displayInfo();
    }
}`,
        examples: [
          {
            input: 'name = "John", age = 20, gpa = 3.5',
            output: 'Name: John, Age: 20, GPA: 3.5',
          },
        ],
      },
      {
        id: 'q5',
        title: 'Bank Account Class',
        description: 'Create a BankAccount class with deposit, withdraw, and getBalance methods.',
        difficulty: 'Medium',
        solved: true,
        starterCode: `public class BankAccount {
    private double balance;

    public BankAccount(double initialBalance) {
        // Initialize balance
    }

    public void deposit(double amount) {
        // Implement deposit
    }

    public void withdraw(double amount) {
        // Implement withdraw
    }

    public double getBalance() {
        return balance;
    }
}`,
        examples: [
          {
            input: 'deposit(100), withdraw(30)',
            output: 'Balance: 70.0',
          },
        ],
      },
      {
        id: 'q6',
        title: 'Rectangle Class with Area',
        description: 'Create a Rectangle class with width and height. Add a method to calculate area.',
        difficulty: 'Easy',
        solved: false,
        starterCode: `public class Rectangle {
    // Define your fields

    // Constructor

    // Method to calculate area

}`,
        examples: [
          {
            input: 'width = 5, height = 10',
            output: 'Area: 50',
          },
        ],
      },
    ],
  },
  {
    id: 'assign3',
    title: 'Arrays and Loops',
    description: 'Work with arrays and iteration',
    dueDate: '2026-04-25',
    progress: 33,
    pdfUrl: '/assignments/arrays-loops.pdf',
    questions: [
      {
        id: 'q7',
        title: 'Find Maximum in Array',
        description: 'Write a method to find the maximum element in an integer array.',
        difficulty: 'Easy',
        solved: true,
        starterCode: `public class Main {
    public static int findMax(int[] arr) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        int[] numbers = {3, 7, 2, 9, 1};
        System.out.println(findMax(numbers));
    }
}`,
        examples: [
          {
            input: '[3, 7, 2, 9, 1]',
            output: '9',
          },
        ],
      },
      {
        id: 'q8',
        title: 'Reverse an Array',
        description: 'Write a method that reverses an array in-place.',
        difficulty: 'Medium',
        solved: false,
        starterCode: `public class Main {
    public static void reverseArray(int[] arr) {
        // Write your code here

    }

    public static void main(String[] args) {
        int[] numbers = {1, 2, 3, 4, 5};
        reverseArray(numbers);
        for (int num : numbers) {
            System.out.print(num + " ");
        }
    }
}`,
        examples: [
          {
            input: '[1, 2, 3, 4, 5]',
            output: '[5, 4, 3, 2, 1]',
          },
        ],
      },
      {
        id: 'q9',
        title: 'Sum of Array Elements',
        description: 'Calculate the sum of all elements in an integer array.',
        difficulty: 'Easy',
        solved: false,
        starterCode: `public class Main {
    public static int sumArray(int[] arr) {
        // Write your code here
        return 0;
    }
}`,
        examples: [
          {
            input: '[1, 2, 3, 4, 5]',
            output: '15',
          },
        ],
      },
    ],
  },
  {
    id: 'assign4',
    title: 'Recursion & Algorithms',
    description: 'Advanced problem solving',
    dueDate: '2026-04-30',
    progress: 0,
    pdfUrl: '/assignments/recursion-algorithms.pdf',
    questions: [
      {
        id: 'q10',
        title: 'Factorial Calculation',
        description: 'Implement a recursive method to calculate the factorial of a number.',
        difficulty: 'Medium',
        solved: false,
        starterCode: `public class Main {
    public static int factorial(int n) {
        // Write your code here
        return 0;
    }
}`,
        examples: [
          {
            input: 'n = 5',
            output: '120',
          },
        ],
      },
      {
        id: 'q11',
        title: 'Fibonacci Sequence',
        description: 'Write a recursive method to find the nth Fibonacci number.',
        difficulty: 'Medium',
        solved: false,
        starterCode: `public class Main {
    public static int fibonacci(int n) {
        // Write your code here
        return 0;
    }
}`,
        examples: [
          {
            input: 'n = 6',
            output: '8',
          },
        ],
      },
      {
        id: 'q12',
        title: 'Binary Search',
        description: 'Implement binary search on a sorted array.',
        difficulty: 'Hard',
        solved: false,
        starterCode: `public class Main {
    public static int binarySearch(int[] arr, int target) {
        // Write your code here
        return -1;
    }
}`,
        examples: [
          {
            input: 'arr = [1, 3, 5, 7, 9], target = 5',
            output: '2',
          },
        ],
      },
    ],
  },
];
