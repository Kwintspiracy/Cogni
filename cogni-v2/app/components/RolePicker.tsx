import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type AgentRole =
  | 'builder'
  | 'skeptic'
  | 'moderator'
  | 'hacker'
  | 'storyteller'
  | 'investor'
  | 'researcher'
  | 'contrarian'
  | 'philosopher'
  | 'provocateur';

interface RoleOption {
  role: AgentRole;
  icon: string;
  description: string;
  archetype: { openness: number; aggression: number; neuroticism: number };
  template: string;
}

const ROLES: RoleOption[] = [
  {
    role: 'builder',
    icon: '🔨',
    description: 'Creates solutions and builds things',
    archetype: { openness: 0.6, aggression: 0.3, neuroticism: 0.4 },
    template: 'Solution: [idea]. Why: [reason]. Risk: [concern]'
  },
  {
    role: 'skeptic',
    icon: '🔍',
    description: 'Questions claims and demands evidence',
    archetype: { openness: 0.5, aggression: 0.7, neuroticism: 0.6 },
    template: 'Claim: [X]. Problem: [Y]. Evidence: [Z]'
  },
  {
    role: 'moderator',
    icon: '⚖️',
    description: 'Bridges perspectives and finds middle ground',
    archetype: { openness: 0.5, aggression: 0.2, neuroticism: 0.3 },
    template: 'Parties: [A, B]. Middle: [synthesis]. Path: [action]'
  },
  {
    role: 'hacker',
    icon: '💻',
    description: 'Finds weaknesses and exploits systems',
    archetype: { openness: 0.8, aggression: 0.6, neuroticism: 0.5 },
    template: 'System: [target]. Weakness: [flaw]. Exploit: [method]'
  },
  {
    role: 'storyteller',
    icon: '📖',
    description: 'Weaves narratives and finds meaning',
    archetype: { openness: 0.8, aggression: 0.3, neuroticism: 0.5 },
    template: 'Setting: [context]. Twist: [event]. Meaning: [moral]'
  },
  {
    role: 'investor',
    icon: '💰',
    description: 'Evaluates opportunities and risks',
    archetype: { openness: 0.4, aggression: 0.5, neuroticism: 0.4 },
    template: 'Thesis: [bet]. Upside: [potential]. Risk: [downside]'
  },
  {
    role: 'researcher',
    icon: '🔬',
    description: 'Investigates questions with data',
    archetype: { openness: 0.7, aggression: 0.3, neuroticism: 0.4 },
    template: 'Question: [topic]. Finding: [data]. Implication: [conclusion]'
  },
  {
    role: 'contrarian',
    icon: '⚡',
    description: 'Challenges consensus and offers alternatives',
    archetype: { openness: 0.6, aggression: 0.8, neuroticism: 0.5 },
    template: 'Consensus: [popular view]. Flaw: [error]. Alternative: [take]'
  },
  {
    role: 'philosopher',
    icon: '🤔',
    description: 'Explores deep questions and paradoxes',
    archetype: { openness: 0.9, aggression: 0.4, neuroticism: 0.6 },
    template: 'Premise: [assumption]. Logic: [reasoning]. Paradox: [tension]'
  },
  {
    role: 'provocateur',
    icon: '🔥',
    description: 'Challenges sacred cows and stirs debate',
    archetype: { openness: 0.7, aggression: 0.9, neuroticism: 0.4 },
    template: 'Sacred cow: [belief]. Heresy: [challenge]. Why: [logic]'
  },
];

interface RolePickerProps {
  selectedRole?: AgentRole;
  onSelectRole: (role: AgentRole) => void;
}

export default function RolePicker({ selectedRole, onSelectRole }: RolePickerProps) {
  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {ROLES.map((roleOption) => (
          <TouchableOpacity
            key={roleOption.role}
            style={[
              styles.roleButton,
              selectedRole === roleOption.role && styles.roleButtonSelected,
            ]}
            onPress={() => onSelectRole(roleOption.role)}
          >
            <Text style={styles.roleIcon}>{roleOption.icon}</Text>
            <Text style={styles.roleTitle}>{roleOption.role.charAt(0).toUpperCase() + roleOption.role.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedRole && (
        <View style={styles.description}>
          <Text style={styles.descriptionTitle}>
            {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
          </Text>
          <Text style={styles.descriptionText}>
            {ROLES.find(r => r.role === selectedRole)?.description}
          </Text>
          <Text style={styles.templateLabel}>Writing Template:</Text>
          <Text style={styles.template}>
            {ROLES.find(r => r.role === selectedRole)?.template}
          </Text>
        </View>
      )}
    </View>
  );
}

export function getRoleData(role: AgentRole): RoleOption | undefined {
  return ROLES.find(r => r.role === role);
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  roleButton: {
    width: '48%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
    padding: 16,
    alignItems: 'center',
    minHeight: 100,
    justifyContent: 'center',
  },
  roleButtonSelected: {
    borderColor: '#00ff00',
    backgroundColor: '#002200',
  },
  roleIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  roleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  description: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00ff00',
  },
  descriptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ff00',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 12,
    lineHeight: 20,
  },
  templateLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  template: {
    fontSize: 13,
    color: '#00ff00',
    fontFamily: 'monospace',
    fontStyle: 'italic',
  },
});
