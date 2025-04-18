# Pathfinder Second Edition Character Manager

A React-based web application for managing Pathfinder 2E character sheets, inventory, session notes, and campaign lore.

## Features

- Create and manage multiple Pathfinder 2E characters
- Track character stats, skills, and abilities
- Manage character inventory
- Record session notes for each character
- Organize campaign lore entries by category
- Data stored in browser's localStorage

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/pathfinder-2e-manager.git
   cd pathfinder-2e-manager
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) to view the app in your browser.

## Project Structure

- `src/components`: Reusable UI components
- `src/pages`: Main application pages
- `src/contexts`: React context providers for state management
- `src/App.js`: Main application component with routing

## Deployment

This app can be deployed to any static hosting service:

### Build for production

```
npm run build
```

Then upload the contents of the `build` folder to your hosting provider.

## Hosting Options

- GitHub Pages
- Netlify
- Vercel
- AWS Amplify
- Firebase Hosting

## License

This project is licensed under the MIT License - see the LICENSE file for details.

// File: package.json
{
  "name": "pathfinder-2e-manager",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@testing-library/jest-dom": "^5.16.5",
    "@testing-library/react": "^13.4.0",
    "@testing-library/user-event": "^13.5.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.10.0",
    "react-scripts": "5.0.1",
    "web-vitals": "^2.1.4"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "eslintConfig": {
    "extends": [
      "react-app",
      "react-app/jest"
    ]
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  }
}