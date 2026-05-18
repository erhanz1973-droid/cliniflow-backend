# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Push notifications & sound (doctor-clean)

This app already configures:

1. **`Notifications.setNotificationHandler`** — `shouldPlaySound: true` (see `app/_layout.tsx`).
2. **Android channel `default`** — `sound: 'default'`, `importance: MAX` (see `hooks/use-push-notifications.ts`).
3. **Backend payload** — `cliniflow-backend-clean` sends `sound: "default"` and `channelId: "default"` when message sound is on (`sendExpoToEntity` in `index.cjs`).
4. **iOS permission request** — `allowSound: true` with `allowAlert` / `allowBadge` in `requestPermissionsAsync`.

**Expo Go:** Remote notifications may appear, but **reliable push sound / full APNs behavior is not guaranteed** in Expo Go (SDK 53+). Metro will log `[PUSH_SOUND] Running in Expo Go…` when `Constants.appOwnership === "expo"`.

**Test like production:** use a **development build** (this repo includes `expo-dev-client` and `eas.json` → profile `development`):

```bash
# Install EAS CLI if needed: npm i -g eas-cli
eas build --profile development --platform ios
# After install on device:
npm run start:dev
```

`npm run start:dev` runs `expo start --dev-client` so the installed dev client loads your JS bundle.

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
