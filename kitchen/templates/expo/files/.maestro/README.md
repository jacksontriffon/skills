# Maestro flows

Flows under `flows/` drive the app. `node .claude/kitchen/scripts/drive.mjs <flow>` runs them on Expo web through Playwright, and `maestro test .maestro/flows` runs the same files on a device or simulator.

## Naming what a flow taps

Give every element a flow taps or asserts on a `testID`, and assert on the id, not on visible text. Copy changes, translations and loading states move text; an id stays put.

- Name the id after what the element is, in kebab case: `screen-home`, `button-save`, `input-email`. A screen's root view is `screen-<route>`.
- On web, React Native renders `testID` as `data-testid`, which is what the driver matches.
- In a flow, use `- tapOn: {id: button-save}` and `- assertVisible: {id: screen-home}`.
- Tap by text only where there is no element to name, such as a system dialog.

A selector that never appears usually means the id is missing. Add it to the component here before raising the timeout.
