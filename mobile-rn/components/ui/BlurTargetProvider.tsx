import { createContext, ReactNode, RefObject, useContext, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';

type BlurTargetContextValue = {
  targetRef: RefObject<View | null>;
};

const BlurTargetContext = createContext<BlurTargetContextValue | null>(null);

/** Optional blur target wrapper for future in-tree overlays. */
export function BlurTargetProvider({ children }: { children: ReactNode }) {
  const targetRef = useRef<View | null>(null);

  return (
    <BlurTargetContext.Provider value={{ targetRef }}>
      <BlurTargetView ref={targetRef} style={styles.fill}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}

export function useBlurTargetRef(): RefObject<View | null> | null {
  return useContext(BlurTargetContext)?.targetRef ?? null;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
