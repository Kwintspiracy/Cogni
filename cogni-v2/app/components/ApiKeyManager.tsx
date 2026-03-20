import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeyManagerProps {
  agentId: string;
  keyPrefix?: string;
  lastUsedAt?: string;
  /** Called after successful key change. Receives the new full key on regenerate, undefined on revoke. */
  onKeyRegenerated?: (newKey?: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(ts: string | null): string {
  if (!ts) return 'Never';
  const d = new Date(ts);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function copyToClipboard(text: string) {
  try {
    await Share.share({ message: text });
  } catch {
    Alert.alert('API Key', text);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ApiKeyManager({
  agentId,
  keyPrefix,
  lastUsedAt,
  onKeyRegenerated,
}: ApiKeyManagerProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleRegenerate() {
    Alert.alert(
      'Regenerate API Key',
      'This will immediately revoke the old key. Any active connections using it will stop working. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            try {
              setRegenerating(true);
              setNewKey(null);
              const { data, error } = await supabase.rpc('generate_agent_api_key', {
                p_agent_id: agentId,
              });
              if (error) throw error;
              const key = typeof data === 'string' ? data : null;
              if (!key) throw new Error('No key returned');
              setNewKey(key);
              onKeyRegenerated?.(key);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to regenerate API key');
            } finally {
              setRegenerating(false);
            }
          },
        },
      ],
    );
  }

  function handleRevoke() {
    Alert.alert(
      'Revoke API Key',
      'Are you sure you want to revoke this key?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, revoke it',
          style: 'destructive',
          onPress: () => confirmRevoke(),
        },
      ],
    );
  }

  function confirmRevoke() {
    Alert.alert(
      'Confirm Revoke',
      'This is permanent. The key will be gone and your agent will stop accepting API calls. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke Forever',
          style: 'destructive',
          onPress: async () => {
            try {
              setRevoking(true);
              const { error } = await supabase
                .from('agent_api_credentials')
                .update({ revoked_at: new Date().toISOString() })
                .eq('agent_id', agentId)
                .is('revoked_at', null);
              if (error) throw error;
              setNewKey(null);
              onKeyRegenerated?.();
              Alert.alert('Key Revoked', 'The API key has been permanently revoked.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to revoke API key');
            } finally {
              setRevoking(false);
            }
          },
        },
      ],
    );
  }

  async function handleCopy() {
    if (!newKey) return;
    await copyToClipboard(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const isBusy = regenerating || revoking;

  return (
    <View style={styles.container}>
      {/* Current key info */}
      <View style={styles.keyInfoRow}>
        <View style={styles.keyPrefixBox}>
          <Text style={styles.keyPrefixLabel}>Current Key</Text>
          <Text style={styles.keyPrefixValue}>
            {keyPrefix ? `${keyPrefix}...` : 'cog_••••••••...'}
          </Text>
        </View>
        <View style={styles.lastUsedBox}>
          <Text style={styles.lastUsedLabel}>Last used</Text>
          <Text style={styles.lastUsedValue}>{formatDateTime(lastUsedAt ?? null)}</Text>
        </View>
      </View>

      {/* New key reveal (shown once after regeneration) */}
      {newKey && (
        <View style={styles.newKeySection}>
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Save this key now</Text>
            <Text style={styles.warningText}>
              You won't see it again. Store it securely.
            </Text>
          </View>
          <View style={styles.keyBox}>
            <Text style={styles.keyText} selectable numberOfLines={3}>
              {newKey}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.copyButton, copied && styles.copyButtonCopied]}
            onPress={handleCopy}
          >
            <Text style={[styles.copyButtonText, copied && styles.copyButtonTextCopied]}>
              {copied ? 'Copied!' : 'Copy Key'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.regenerateButton, isBusy && styles.buttonDisabled]}
          onPress={handleRegenerate}
          disabled={isBusy}
        >
          {regenerating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.regenerateButtonText}>Regenerate Key</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.revokeButton, isBusy && styles.buttonDisabled]}
          onPress={handleRevoke}
          disabled={isBusy}
        >
          {revoking ? (
            <ActivityIndicator size="small" color="#f87171" />
          ) : (
            <Text style={styles.revokeButtonText}>Revoke</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    gap: 12,
  },
  keyInfoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keyPrefixBox: {
    flex: 1,
  },
  keyPrefixLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  keyPrefixValue: {
    color: '#4ade80',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '600',
  },
  lastUsedBox: {
    alignItems: 'flex-end',
  },
  lastUsedLabel: {
    color: '#666',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  lastUsedValue: {
    color: '#aaa',
    fontSize: 12,
  },

  // New key reveal
  newKeySection: {
    gap: 8,
  },
  warningCard: {
    backgroundColor: '#1a0f00',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#554400',
    gap: 4,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffaa00',
  },
  warningText: {
    fontSize: 12,
    color: '#aaa',
    lineHeight: 16,
  },
  keyBox: {
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#00aa00',
  },
  keyText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#00ff00',
    lineHeight: 18,
  },
  copyButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 7,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  copyButtonCopied: {
    backgroundColor: '#001a00',
    borderColor: '#00aa00',
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  copyButtonTextCopied: {
    color: '#00ff00',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  regenerateButton: {
    flex: 1,
    backgroundColor: '#3a0000',
    borderRadius: 7,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cc3333',
    minHeight: 38,
    justifyContent: 'center',
  },
  revokeButton: {
    backgroundColor: 'transparent',
    borderRadius: 7,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#442222',
    paddingHorizontal: 16,
    minHeight: 38,
    justifyContent: 'center',
  },
  regenerateButtonText: {
    color: '#ff6666',
    fontSize: 13,
    fontWeight: '700',
  },
  revokeButtonText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
