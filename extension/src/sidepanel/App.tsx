import {useEffect, useState} from 'react';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import {Text} from '@astryxdesign/core/Text';
import {Heading} from '@astryxdesign/core/Heading';
import {Badge} from '@astryxdesign/core/Badge';
import {Card} from '@astryxdesign/core/Card';
import {Spinner} from '@astryxdesign/core/Spinner';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {api, HangerError} from './api';
import type {Health} from '../shared/types';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setHealth(await api.health());
    } catch (e) {
      setError(
        e instanceof HangerError ? e.message : 'Something went wrong.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <VStack height="100%" gap={0}>
      <AppHeader health={health} />
      <VStack padding={4} gap={4} isScrollable>
        {loading && <Spinner label="Checking the server" />}

        {error && (
          <Banner
            status="error"
            title="No server"
            description={error}
            endContent={
              <Button label="Try again" variant="secondary" onClick={load} />
            }
          />
        )}

        {health && (
          <Card>
            <VStack gap={2}>
              <Heading level={2}>Server is up</Heading>
              <Text type="supporting">
                {health.mockMode
                  ? 'Running on sample data. Nothing is charged.'
                  : 'Connected to the live try-on API.'}
              </Text>
              <HStack gap={2} vAlign="center">
                <Text type="supporting">
                  {health.unitsSpent} of {health.unitBudget} units used
                </Text>
              </HStack>
            </VStack>
          </Card>
        )}
      </VStack>
    </VStack>
  );
}

function AppHeader({health}: {health: Health | null}) {
  return (
    <HStack
      paddingInline={4}
      paddingBlock={3}
      vAlign="center"
      justify="between">
      <Heading level={1} display="inline">
        <Text type="display-3">Hanger</Text>
      </Heading>
      {health?.mockMode && <Badge variant="neutral" label="Sample data" />}
    </HStack>
  );
}
