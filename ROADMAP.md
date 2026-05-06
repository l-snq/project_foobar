# ROADMAP FOR CLUB.2K

This is essentially a social club game, reminiscient of frutiger aero and club penguin/poptropica.
## Future ideas:
### Long Term
1. Massively multiplayer.
2. The ability for players to own a home, where they can choose premade layouts, and then paint walls and add their own furniture they unlock/purchase.
3. A hub for users to play random minigames, uncover secrets, test out new gameplay mechanics
4. Multiple different worlds for the user to explore
5. crafting furniture

## Short Term
1. Fishing
2. Racing

// proposed look
src/components/Game/
├── GameCanvas.tsx          // Main Entry (The Glue)
├── GameHUD.tsx             // (Existing) UI Overlay
├── engine/
│   ├── SceneManager.ts     // Three.js setup & Lighting
│   ├── PhysicsWorld.ts     // Rapier integration
│   ├── EntityManager.ts    // Logic for spawning/moving players & objects
│   └── ParticleSystem.ts   // The explosion logic
├── hooks/
│   ├── useSocket.ts        // WebSocket management
│   ├── useInput.ts         // Keyboard/Mouse listeners
│   └── useStep.ts          // The animation frame hook
└── utils/
    ├── threeHelpers.ts     // buildGround, makeNameLabel, etc.
