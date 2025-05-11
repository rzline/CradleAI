import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Text, TouchableOpacity, SafeAreaView, useWindowDimensions, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { NodeST, RequestLogData } from '@/NodeST/nodest';

export default function LogScreen() {
  const [requestLog, setRequestLog] = useState<RequestLogData | null>(null);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();

  // NodeST 实例 - 在实际应用中，这可能是从全局状态或context中获取
  const nodeST = React.useMemo(() => new NodeST(), []);

  // 获取最新日志
  const fetchLatestLog = React.useCallback(() => {
    try {
      const latestLog = nodeST.getLatestApiRequestLog();
      setRequestLog(latestLog);
    } catch (error) {
      console.error('Error fetching log:', error);
    }
  }, [nodeST]);

  // 屏幕获得焦点或组件挂载时刷新
  useEffect(() => {
    if (isFocused) {
      fetchLatestLog();
    }
  }, [isFocused, fetchLatestLog]);

  // 每5秒自动刷新一次
  useEffect(() => {
    if (isFocused) {
      const interval = setInterval(fetchLatestLog, 5000);
      return () => clearInterval(interval);
    }
  }, [isFocused, fetchLatestLog]);

  // 格式化请求对象
  const formatRequest = (request: any): string => {
    try {
      if (Array.isArray(request)) {
        return request.map((msg, i) => {
          const role = msg.role || 'unknown';
          const content = msg.parts ?
            msg.parts.map((part: any, j: number) =>
              `    Part ${j + 1}: ${typeof part.text === 'string' ? part.text.substring(0, 100) + '...' : 'N/A'}`
            ).join('\n') :
            msg.content ? `    Content: ${msg.content.substring(0, 100)}...` : 'No content';

          return `Message ${i + 1} [${role}]:\n${content}`;
        }).join('\n\n');
      } else {
        return JSON.stringify(request, null, 2);
      }
    } catch (e) {
      return `Error formatting request: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  // 响应内容格式化（如为对象则格式化为字符串）
  const formatResponse = (response: any): string => {
    if (typeof response === 'string') return response;
    if (response == null) return '';
    try {
      return JSON.stringify(response, null, 2);
    } catch {
      return String(response);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      {/* 顶部标签栏整体下移，避开状态栏 */}
      <View style={[styles.tabBar, { width }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'request' && styles.activeTab]}
          onPress={() => setActiveTab('request')}
        >
          <Text style={[styles.tabText, activeTab === 'request' && styles.activeTabText]}>请求体</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'response' && styles.activeTab]}
          onPress={() => setActiveTab('response')}
        >
          <Text style={[styles.tabText, activeTab === 'response' && styles.activeTabText]}>响应</Text>
        </TouchableOpacity>
      </View>
      {/* 内容区 */}
      <View style={styles.flex1}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          // 无下拉刷新
        >
          {requestLog ? (
            activeTab === 'request' ? (
              <View style={styles.section}>
                <ScrollView style={styles.codeBlock} horizontal={false}>
                  <Text style={styles.codeText}>
                    {formatRequest(requestLog.request)}
                  </Text>
                </ScrollView>
              </View>
            ) : (
              <View style={styles.section}>
                <ScrollView style={styles.codeBlock} horizontal={false}>
                  <Text style={styles.codeText}>
                    {requestLog.response ? formatResponse(requestLog.response) : '等待响应...'}
                  </Text>
                </ScrollView>
              </View>
            )
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>无可用日志数据</Text>
              <Text style={styles.noDataSubtext}>请发送一条消息</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f0f0f5',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 32 : 24, // 增加顶部内边距，避开状态栏
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#4a6fa5',
    backgroundColor: '#f5f8ff',
  },
  tabText: {
    fontSize: 16,
    color: '#888',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#4a6fa5',
    fontWeight: 'bold',
  },
  flex1: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f0f0f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    padding: 16,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 120,
  },
  codeBlock: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    borderRadius: 5,
    maxHeight: 400,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#222',
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#888',
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 8,
  },
});
