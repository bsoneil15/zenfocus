# Overview

This is a modern Pomodoro timer application with AI-powered ambient soundscape generation. The app combines traditional Pomodoro technique productivity features with custom sound effects generated via ElevenLabs' text-to-sound API and OpenAI's GPT models. Users log in via Replit auth and get full access to all sounds — predefined, bonus, and AI-generated.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Radix UI components with shadcn/ui design system
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: React hooks with custom state management patterns
- **Data Fetching**: TanStack Query (React Query) for server state management

## Backend Architecture
- **Runtime**: Node.js with Express.js web framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with structured route handlers
- **Storage**: DatabaseStorage with Drizzle ORM (PostgreSQL)
- **Development**: Vite middleware integration for hot reloading in development

## Database Schema
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Tables**: 
  - Users (authentication via Replit auth)
  - Soundscapes (predefined + AI-generated audio content)
  - Pomodoro Sessions (timer session tracking)
- **Schema Validation**: Zod schemas for type-safe database operations

## Audio Management
- **Audio Processing**: Web Audio API for real-time audio manipulation
- **Audio Context**: Browser-native AudioContext with gain nodes for volume control
- **Looping**: Custom audio buffer creation and seamless looping implementation
- **Notifications**: Custom notification sounds generated procedurally
- **Predefined Sounds**: Rain and Coffee Shop audio served as committed read-only static files under `/attached_assets/` (the legacy `/api/audio/:filename` endpoint was removed and now returns 410 Gone)
- **Bonus Sounds**: City Park, Distant Thunder, Jazz Bar — all available to logged-in users automatically
- **AI Generated**: Custom soundscapes generated via ElevenLabs API

## State Management Patterns
- **Timer State**: Custom hook with localStorage persistence for settings
- **Audio State**: Centralized audio manager with Web Audio API integration
- **UI State**: Component-level state with prop drilling for simple data flow
- **Settings Persistence**: localStorage for user preferences and timer configurations

# External Dependencies

## AI Services
- **ElevenLabs API**: Text-to-sound effects generation for ambient soundscapes
- **OpenAI API**: GPT-5 for generating soundscape prompt suggestions and naming

## Database
- **Neon Database**: Serverless PostgreSQL with connection pooling
- **Drizzle Kit**: Database migrations and schema management

## UI Components
- **Radix UI**: Headless UI primitives for accessibility and behavior
- **Lucide React**: Icon library for consistent iconography
- **Embla Carousel**: Touch-friendly carousel component

## Development Tools
- **ESBuild**: Fast JavaScript bundler for production builds
- **TSX**: TypeScript execution for development server
- **PostCSS**: CSS processing with Tailwind CSS integration

## Browser APIs
- **Web Audio API**: Real-time audio processing and playback
- **Notifications API**: Browser notifications for timer completion
- **LocalStorage**: Client-side persistence for user settings
