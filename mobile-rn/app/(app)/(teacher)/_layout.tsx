import { Tabs } from 'expo-router';
import { tabIcon, useTabScreenOptions } from '../../../lib/tab-options';

export default function TeacherLayout() {
  const screenOptions = useTabScreenOptions();

  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, focused }) => tabIcon('home-outline', 'home', focused, color),
        }}
      />
      <Tabs.Screen
        name="ai-review"
        options={{
          tabBarLabel: 'Review',
          tabBarIcon: ({ color, focused }) => tabIcon('sparkles-outline', 'sparkles', focused, color),
        }}
      />
      <Tabs.Screen
        name="therapy"
        options={{
          tabBarLabel: 'Therapy',
          tabBarIcon: ({ color, focused }) => tabIcon('calendar-outline', 'calendar', focused, color),
        }}
      />
      <Tabs.Screen
        name="materials"
        options={{
          tabBarLabel: 'Materials',
          tabBarIcon: ({ color, focused }) => tabIcon('book-outline', 'book', focused, color),
        }}
      />
      <Tabs.Screen
        name="medication"
        options={{
          tabBarLabel: 'Meds',
          tabBarIcon: ({ color, focused }) => tabIcon('medkit-outline', 'medkit', focused, color),
        }}
      />
      <Tabs.Screen name="assessments" options={{ href: null }} />
      <Tabs.Screen name="child" options={{ href: null, headerShown: false }} />
    </Tabs>
  );
}
