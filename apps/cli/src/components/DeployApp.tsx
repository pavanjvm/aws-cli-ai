import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

interface DeployAppProps {
  region?: string;
  service?: string;
}

export const DeployApp: React.FC<DeployAppProps> = ({ region = 'us-east-1', service = 'my-app' }) => {
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'deploying' | 'done'>('idle');
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    setStatus('analyzing');
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Analyzing deployment configuration...`]);
    
    setTimeout(() => {
      setStatus('deploying');
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Preparing deployment to ${region}...`]);
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Service: ${service}`]);
    }, 1000);

    setTimeout(() => {
      setStatus('done');
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Deployment complete!`]);
    }, 2500);
  }, [region, service]);

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="bold" borderColor="cyan" padding={1}>
        <Text bold cyan>🚀 AWS Deployment Assistant</Text>
      </Box>
      
      <Text>Region: {region}</Text>
      <Text>Service: {service}</Text>
      <Text>Status: <Text color={status === 'done' ? 'green' : 'yellow'}>{status.toUpperCase()}</Text></Text>
      
      <Box flexDirection="column" marginTop={1}>
        {logs.map((log, i) => (
          <Text key={i} dimColor>{log}</Text>
        ))}
      </Box>
      
      <Text dimColor marginTop={1}>Type 'exit' to quit</Text>
    </Box>
  );
};
