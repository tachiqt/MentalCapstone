import { Tabs } from 'expo-router';
import { tabIcon, useParentTabScreenOptions } from '../../../lib/parent-tab-options';

export default function ParentLayout() {
  const screenOptions = useParentTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions} initialRouteName="progress">
      <Tabs.Screen
        name="progress"
        options={{
          tabBarLabel: 'Progress',
          tabBarIcon: ({ color, focused }) => tabIcon('trending-up-outline', 'trending-up', focused, color),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color, focused }) => tabIcon('calendar-outline', 'calendar', focused, color),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, focused }) => tabIcon('person-outline', 'person', focused, color),
        }}
      />
      <Tabs.Screen name="therapy" options={{ href: null }} />
      <Tabs.Screen name="feedback" options={{ href: null }} />
      <Tabs.Screen name="child" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
