# FIR-Explorer by Vincent Bevia

![FIR Explorer](assets/FIR-Explorer.png)

FIR-Explorer is an interactive React-based tool for exploring FIR filter behavior, frequency response, and DSP concepts visually.

## Getting Started

This project is very easy to run locally.

Install the dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

You should see an output similar to this:

```bash
VITE v8.0.13  ready in 747 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

Then open the local URL in your browser:

```bash
http://localhost:5173/
```

## React + TypeScript + Vite

This project is built with React, TypeScript, and Vite.

Vite provides a fast development environment with Hot Module Replacement, making it convenient to build and iterate on modern frontend applications.

Currently, two official React plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled in this project by default because it may affect development and build performance.

To add it, see the official React documentation:

- [React Compiler Installation](https://react.dev/learn/react-compiler/installation)

## Expanding the ESLint Configuration

If you are developing this project further as a production application, consider updating the ESLint configuration to enable type-aware lint rules.

Example:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Replace tseslint.configs.recommended with this:
      tseslint.configs.recommendedTypeChecked,

      // Or use this for stricter rules:
      tseslint.configs.strictTypeChecked,

      // Optionally, add this for stylistic rules:
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install React-specific lint plugins:

- [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x)
- [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom)

Example configuration:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Enable lint rules for React:
      reactX.configs['recommended-typescript'],

      // Enable lint rules for React DOM:
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
