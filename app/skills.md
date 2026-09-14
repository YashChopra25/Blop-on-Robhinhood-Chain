# skills.md

## Frontend Development Standards

### 1. File Size Restrictions

- No `.jsx` or `.tsx` file may exceed **150 lines of code**.
- When a file approaches the limit:

  - Extract reusable UI into separate components.
  - Move business logic into custom hooks.
  - Move constants into dedicated files.
  - Move utility functions into helper modules.

- Large components should be split by responsibility.

---

### 2. Custom Hooks First

- Business logic must not live inside UI components.
- API calls, data transformations, state management, side effects, and reusable behaviors must be extracted into custom hooks.

#### Required Structure

```text
hooks/
├── use-auth.ts
├── use-user.ts
├── use-pagination.ts
└── use-dashboard-data.ts
```

#### Rules

- Hook names must start with `use`.
- Hooks should expose a clean public API.
- Components should consume hooks rather than implement complex logic directly.
- components or modularity based approach should be followed
- every component or tsx/jsx can have atmost 150-180 LOCs only
- do follow the custom hooks approaches.

---

### 3. Project Directory Structure

Every feature should follow a clear and scalable structure.

```text
src/
├── components/
├── hooks/
├── services/
├── pages/
├── constants/
├── types/
├── utils/
├── assets/
├── contexts/
└── store/
```

#### Responsibilities

| Folder     | Purpose                            |
| ---------- | ---------------------------------- |
| components | Reusable UI components             |
| hooks      | Custom React hooks                 |
| services   | API and backend communication      |
| constants  | Static values and configurations   |
| types      | Shared TypeScript types/interfaces |
| utils      | Helper functions                   |
| contexts   | React Context providers            |
| store      | Global state management            |

---

### 4. TypeScript Requirements

All React files must use TypeScript.

#### Mandatory Rules

- Every component must have typed props.
- Every hook must define return types when appropriate.
- Avoid `any`.
- Shared interfaces must be extracted into the `types` directory.
- Prefer `type` and `interface` definitions over implicit typing.

#### Example

```tsx
interface UserCardProps {
  id: string;
  name: string;
  email: string;
}
```

---

### 5. TSX Component Structure

Every component should follow a predictable structure.

```tsx
// Imports

// Types

// Constants

// Hooks

// Component

// Export
```

Example:

```tsx
import { FC } from "react";

interface DashboardProps {
  title: string;
}

const Dashboard: FC<DashboardProps> = ({ title }) => {
  return <div>{title}</div>;
};

export default Dashboard;
```

---

### 6. Separation of Concerns

#### Components

Responsible only for:

- Rendering UI
- Handling user interactions
- Consuming hooks

#### Hooks

Responsible for:

- State management
- Side effects
- Business logic
- Data orchestration

#### Services

Responsible for:

- API communication
- Request/response transformation

#### Utilities

Responsible for:

- Pure helper functions
- Formatting
- Calculations

---

### 7. Naming Conventions

#### Components

```text
UserCard.tsx
DashboardHeader.tsx
ProductList.tsx
```

#### Hooks

```text
useAuth.ts
useUsers.ts
usePagination.ts
```

#### Types

```text
user.types.ts
auth.types.ts
api.types.ts
```

#### Constants

```text
api.constants.ts
route.constants.ts
```

---

### 8. Code Quality Rules

- No file over 150 LOC.
- No business logic inside UI components.
- No inline API calls in components.
- No unused imports.
- No unused variables.
- No duplicated logic.
- Prefer composition over inheritance.
- Prefer reusable hooks over duplicated state logic.
- Keep components small and focused.

---

### 9. PR Validation Checklist

Before submitting code:

- [ ] No `.tsx` or `.jsx` file exceeds 150 LOC.
- [ ] Business logic extracted into hooks.
- [ ] Types moved to `types/`.
- [ ] Constants moved to `constants/`.
- [ ] API calls moved to `services/`.
- [ ] No `any` usage.
- [ ] Components have typed props.
- [ ] Folder structure follows project standards.
- [ ] No linting or TypeScript errors.
- [ ] Code is modular and maintainable.

---

### 10. Expected AI Assistant Behavior

When generating code:

1. Always create appropriate folder structures.
2. Extract reusable logic into custom hooks.
3. Generate TypeScript-first solutions.
4. Keep component files under 150 LOC.
5. Create separate files for:

   - hooks
   - types
   - constants
   - services
   - utilities

6. Follow separation of concerns strictly.
7. Prefer maintainability and scalability over quick implementations.
