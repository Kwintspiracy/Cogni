import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionTestCardProps {
  apiKey?: string;
  agentId: string;
}

type TestState = 'idle' | 'testing' | 'success' | 'error';

interface TestResult {
  energy?: number;
  status?: string;
  designation?: string;
  errorMessage?: string;
  responseTimeMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CORTEX_API_BASE = 'https://fkjtoipnxdptxvdlxqjp.supabase.co/functions/v1/cortex-api';
const TEST_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConnectionTestCard({ apiKey, agentId }: ConnectionTestCardProps) {
  const [testState, setTestState] = useState<TestState>('idle');
  const [result, setResult] = useState<TestResult | null>(null);

  async function runTest() {
    if (!apiKey) {
      setTestState('error');
      setResult({ errorMessage: 'No API key available. Regenerate a key first.' });
      return;
    }

    setTestState('testing');
    setResult(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

    const startTime = Date.now();
    try {
      const response = await fetch(`${CORTEX_API_BASE}/home`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          if (body?.error) msg = body.error;
          else if (body?.message) msg = body.message;
        } catch {
          // ignore parse error
        }
        setTestState('error');
        setResult({ errorMessage: msg, responseTimeMs: elapsed });
        return;
      }

      const data = await response.json();
      setTestState('success');
      setResult({
        energy: data?.agent?.synapses ?? data?.synapses ?? undefined,
        status: data?.agent?.status ?? data?.status ?? undefined,
        designation: data?.agent?.designation ?? data?.designation ?? undefined,
        responseTimeMs: elapsed,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      const elapsed = Date.now() - startTime;
      let msg = err.name === 'AbortError'
        ? 'Connection timed out after 10 seconds'
        : err.message || 'Connection failed';
      setTestState('error');
      setResult({ errorMessage: msg, responseTimeMs: elapsed });
    }
  }

  function reset() {
    setTestState('idle');
    setResult(null);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Connection Test</Text>
        {testState !== 'idle' && testState !== 'testing' && (
          <TouchableOpacity onPress={reset} style={styles.resetButton}>
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      {testState === 'idle' && (
        <Text style={styles.description}>
          Verify your agent can reach the Cortex API with its current key.
        </Text>
      )}

      {testState === 'success' && result && (
        <View style={styles.successCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.successIcon}>OK</Text>
            <Text style={styles.successLabel}>Connected</Text>
            {result.responseTimeMs != null && (
              <Text style={styles.responseTime}>{result.responseTimeMs}ms</Text>
            )}
          </View>
          {(result.designation || result.status != null || result.energy != null) && (
            <View style={styles.resultDetails}>
              {result.designation && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultKey}>Agent</Text>
                  <Text style={styles.resultValue}>{result.designation}</Text>
                </View>
              )}
              {result.status != null && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultKey}>Status</Text>
                  <Text style={[styles.resultValue, { color: result.status === 'ACTIVE' ? '#4ade80' : '#fbbf24' }]}>
                    {result.status}
                  </Text>
                </View>
              )}
              {result.energy != null && (
                <View style={styles.resultRow}>
                  <Text style={styles.resultKey}>Energy</Text>
                  <Text style={styles.resultValue}>{result.energy} synapses</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {testState === 'error' && result && (
        <View style={styles.errorCard}>
          <View style={styles.resultHeader}>
            <Text style={styles.errorIcon}>FAIL</Text>
            <Text style={styles.errorLabel}>Connection Failed</Text>
            {result.responseTimeMs != null && (
              <Text style={styles.responseTime}>{result.responseTimeMs}ms</Text>
            )}
          </View>
          <Text style={styles.errorMessage}>{result.errorMessage}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[
          styles.testButton,
          testState === 'testing' && styles.testButtonDisabled,
        ]}
        onPress={runTest}
        disabled={testState === 'testing'}
      >
        {testState === 'testing' ? (
          <View style={styles.testingRow}>
            <ActivityIndicator size="small" color="#000" />
            <Text style={styles.testButtonText}>Testing...</Text>
          </View>
        ) : (
          <Text style={styles.testButtonText}>
            {testState === 'idle' ? 'Test Connection' : 'Test Again'}
          </Text>
        )}
      </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
  },
  resetButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#1a1a1a',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  resetText: {
    color: '#888',
    fontSize: 12,
  },

  // Success card
  successCard: {
    backgroundColor: '#001a00',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#00aa00',
    gap: 8,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successIcon: {
    color: '#00ff00',
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'monospace',
    backgroundColor: '#004400',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  successLabel: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  responseTime: {
    color: '#666',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  resultDetails: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: '#003300',
    paddingTop: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultKey: {
    color: '#666',
    fontSize: 12,
  },
  resultValue: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },

  // Error card
  errorCard: {
    backgroundColor: '#1a0000',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#660000',
    gap: 8,
  },
  errorIcon: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'monospace',
    backgroundColor: '#3a0000',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  errorLabel: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  errorMessage: {
    color: '#cc6666',
    fontSize: 12,
    lineHeight: 18,
  },

  // Test button
  testButton: {
    backgroundColor: '#00ff00',
    borderRadius: 7,
    padding: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  testButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.6,
  },
  testButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  testingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
