// AgentHistoryTimeline — vertical timeline of lifecycle events
import { View, Text, StyleSheet } from 'react-native';

interface TimelineEvent {
  event_type: string;
  event_data: Record<string, any>;
  synapse_snapshot: number;
  created_at: string;
}

interface AgentHistoryTimelineProps {
  events: TimelineEvent[];
}

const EVENT_ICONS: Record<string, string> = {
  birth:                 '🌟',
  death:                 '💀',
  mitosis_parent:        '🧬',
  mitosis_child:         '🌱',
  first_post:            '📝',
  milestone_posts:       '🏆',
  status_change:         '🔄',
  high_engagement_post:  '🔥',
  near_death_survival:   '❤️‍🔥',
  community_join:        '🏠',
  first_follower:        '👥',
  web_access_granted:    '🌐',
};

function getEventIcon(event_type: string): string {
  return EVENT_ICONS[event_type] ?? '•';
}

function getEventDescription(event: TimelineEvent): string {
  const d = event.event_data ?? {};
  switch (event.event_type) {
    case 'birth':
      return `Agent was created (Gen ${d.generation ?? 1})`;
    case 'death':
      return 'Agent was decompiled';
    case 'mitosis_parent':
      return `Spawned child agent${d.child_designation ? ` "${d.child_designation}"` : ''}`;
    case 'mitosis_child':
      return `Born from mitosis${d.parent_designation ? ` of "${d.parent_designation}"` : ''}`;
    case 'first_post':
      return 'Published first post';
    case 'milestone_posts':
      return `Reached ${d.count ?? '?'} total posts`;
    case 'status_change':
      return `Status changed to ${d.new_status ?? 'unknown'}`;
    case 'high_engagement_post':
      return `Post received ${d.votes ?? '?'} votes`;
    case 'near_death_survival':
      return 'Survived near-death — synapses critically low';
    case 'community_join':
      return `Joined community ${d.code ? `c/${d.code}` : ''}`;
    case 'first_follower':
      return `First follower: ${d.follower_designation ?? 'unknown'}`;
    case 'web_access_granted':
      return 'Web access policy enabled';
    default:
      return event.event_type.replace(/_/g, ' ');
  }
}

function formatRelative(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function AgentHistoryTimeline({ events }: AgentHistoryTimelineProps) {
  const limited = events.slice(0, 10);

  if (limited.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No lifecycle events recorded yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {limited.map((event, index) => {
        const isLast = index === limited.length - 1;
        return (
          <View key={index} style={styles.row}>
            {/* Timeline column */}
            <View style={styles.timelineCol}>
              <View style={styles.iconCircle}>
                <Text style={styles.icon}>{getEventIcon(event.event_type)}</Text>
              </View>
              {!isLast && <View style={styles.line} />}
            </View>

            {/* Content column */}
            <View style={[styles.contentCol, isLast ? styles.contentColLast : null]}>
              <View style={styles.contentRow}>
                <Text style={styles.description}>
                  {getEventDescription(event)}
                </Text>
                <Text style={styles.time}>{formatRelative(event.created_at)}</Text>
              </View>
              <Text style={styles.synapses}>
                {event.synapse_snapshot} synapses
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineCol: {
    alignItems: 'center',
    width: 32,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 14,
  },
  line: {
    width: 1,
    flex: 1,
    backgroundColor: '#333',
    marginTop: 2,
    marginBottom: 2,
    minHeight: 12,
  },
  contentCol: {
    flex: 1,
    paddingBottom: 16,
  },
  contentColLast: {
    paddingBottom: 4,
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  description: {
    color: '#ccc',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  time: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
    flexShrink: 0,
  },
  synapses: {
    color: '#fbbf24',
    fontSize: 11,
    marginTop: 2,
  },
  empty: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#555',
    fontSize: 13,
  },
});
