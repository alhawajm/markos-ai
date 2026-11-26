import React, { useCallback, useLayoutEffect, useRef, useState, type PropsWithChildren } from "react";
import { Keyboard, Platform, View, type KeyboardEvent } from "react-native";

export function useKeyboardTop({ animate = false } = {}) {
  const [top, setTop] = useState(() => Keyboard.metrics()?.screenY);

  useLayoutEffect(() => {
    const ios = Platform.OS === "ios";
    const show = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (event: KeyboardEvent) => {
      if (animate) Keyboard.scheduleLayoutAnimation(event);
      setTop(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (event: KeyboardEvent) => {
      if (animate) Keyboard.scheduleLayoutAnimation(event);
      setTop(undefined);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [animate]);

  return top !== undefined && top > 0 ? top : undefined;
}

export function ChatKeyboardFrame({ backgroundColor, children }: PropsWithChildren<{ backgroundColor: string }>) {
  const frame = useRef<View>(null);
  const [bottom, setBottom] = useState(0);
  const keyboardTop = useKeyboardTop({ animate: true });
  const measure = useCallback(() => {
    frame.current?.measureInWindow((_x, y, _width, height) => setBottom(y + height));
  }, []);

  useLayoutEffect(() => {
    if (keyboardTop !== undefined) measure();
  }, [keyboardTop, measure]);

  // Android may already resize the window. Apply only the overlap left after native layout.
  const overlap = keyboardTop === undefined ? 0 : Math.max(0, Math.ceil(bottom - keyboardTop));
  return (
    <View ref={frame} collapsable={false} onLayout={measure} style={{ flex: 1, backgroundColor }}>
      <View style={{ flex: 1, paddingBottom: overlap }}>{children}</View>
    </View>
  );
}
