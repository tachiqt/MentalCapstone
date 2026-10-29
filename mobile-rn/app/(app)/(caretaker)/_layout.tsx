import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '../../../lib/tab-options';

export default function CaretakerLayout() {
  const screenOptions = useTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions} initialRouteName="today">
      <Tabs.Screen
        name="today"
        options={{
          tabBarLabel: 'Today',
          tabBarIcon: ({ color, focused }) => tabIcon('today-outline', 'today', focused, color),
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          tabBarLabel: 'Log',
          tabBarIcon: ({ color, focused }) => tabIcon('clipboard-outline', 'clipboard', focused, color),
        }}
      />
      <Tabs.Screen
        name="children"
        options={{
          tabBarLabel: 'Children',
          tabBarIcon: ({ color, focused }) => tabIcon('people-outline', 'people', focused, color),
        }}
      />
    </Tabs>
  );
}
