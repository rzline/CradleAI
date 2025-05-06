        {activeTab === 'regex' && (
          <View style={{ padding: 16 }}>
            {/* 启用全局正则脚本 */}
            <View style={styles.row}>
              <Text style={styles.label}>启用全局正则脚本</Text>
              <Switch
                value={regexEnabled}
                onValueChange={handleRegexSwitch}
              />
            </View>
            {/* 下拉选择器 */}
            <Text style={{ color: theme.colors.text, marginBottom: 4 }}>选择正则脚本</Text>
            <TouchableOpacity
              onPress={() => {
                setShowRegexDropdown(!showRegexDropdown);
                setShowPresetDropdown(false);
                setShowWorldbookDropdown(false);
              }}
              style={{
                borderWidth: 1,
                borderColor: '#444',
                borderRadius: 6,
                backgroundColor: theme.colors.cardBackground,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 8,
                height: 40,
              }}
            >
              <Ionicons name="list" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
              <Text style={{ flex: 1, color: theme.colors.text }}>
                {regexScriptList.find(s => s.id === selectedRegexScriptId)?.scriptName || '请选择正则脚本'}
              </Text>
              <Ionicons name={showRegexDropdown ? "chevron-up" : "chevron-down"} size={18} color="#888" />
            </TouchableOpacity>
            {showRegexDropdown && (
              <View style={{
                backgroundColor: theme.colors.cardBackground,
                borderWidth: 1,
                borderColor: '#444',
                borderRadius: 6,
                zIndex: 10,
                maxHeight: 200,
                marginTop: 4,
              }}>
                <ScrollView nestedScrollEnabled={true}>
                  {regexScriptList.map(s => (
                    <TouchableOpacity
                      key={s.id}
                      onPress={() => handleRegexDropdownChange(s.id)}
                      style={{
                        padding: 10,
                        backgroundColor: s.id === selectedRegexScriptId ? '#333' : theme.colors.cardBackground,
                      }}
                    >
                      <Text style={{
                        color: s.id === selectedRegexScriptId ? theme.colors.primary : theme.colors.text
                      }}>
                        {s.scriptName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {regexScriptList.length === 0 && (
                    <Text style={{ padding: 10, color: '#888', textAlign: 'center' }}>
                      尚无可用正则脚本
                    </Text>
                  )}
                </ScrollView>
              </View>
            )}
            {/* 操作按钮 */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>正则脚本</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => setRegexViewMode(v => v === 'compact' ? 'regular' : 'compact')}
                  style={{ marginRight: 8 }}
                >
                  <Ionicons
                    name={regexViewMode === 'compact' ? 'list' : 'grid'}
                    size={22}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRegexManage} style={{ marginRight: 8 }}>
                  <Ionicons
                    name="construct-outline"
                    size={22}
                    color={regexManaging ? theme.colors.primary : '#888'}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeleteCurrentRegexScript}
                  style={{ marginRight: 8 }}
                  disabled={!selectedRegexScriptId}
                >
                  <Ionicons name="trash-outline" size={22} color={selectedRegexScriptId ? theme.colors.danger : '#ccc'} />
                </TouchableOpacity>



                {/* 新增测试按钮 */}
                {/* <TouchableOpacity onPress={handleTestRegex} style={{ marginRight: 8 }}>
                  <Ionicons name="flask-outline" size={22} color={theme.colors.primary} />
                </TouchableOpacity> */}







                
                {/* 新增导入按钮 */}
                <TouchableOpacity onPress={handleImportRegexScript} style={{ marginRight: 8 }}>
                  <Ionicons name="download-outline" size={22} color={theme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCreateRegexScript}>
                  <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
            {/* 紧凑型/常规视图 */}
            {regexViewMode === 'compact'
              ? regexScriptList.map((script, idx) => renderCompactRegexScript(script, idx))
              : regexScriptList.map((script, idx) => (
                  <TouchableOpacity
                    key={script.id}
                    style={styles.promptCard}
                    onPress={() => handleRegexScriptClick(script, idx)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {regexManaging && (
                        <TouchableOpacity
                          onPress={() => toggleRegexSelect(idx)}
                          style={{
                            marginRight: 10,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: theme.colors.primary,
                            backgroundColor: regexSelectedIndexes.includes(idx) ? theme.colors.primary : '#fff',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {regexSelectedIndexes.includes(idx) && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </TouchableOpacity>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>名称</Text>
                          <Text style={styles.promptValue}>{script.scriptName}</Text>
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>查找</Text>
                          <Text style={styles.promptValue}>{script.findRegex}</Text>
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>替换</Text>
                          <Text style={styles.promptValue}>{script.replaceString}</Text>
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>应用</Text>
                          <Text style={styles.promptValue}>
                            {script.placement.includes(1) ? '用户' : ''}
                            {script.placement.includes(1) && script.placement.includes(2) ? '、' : ''}
                            {script.placement.includes(2) ? 'AI' : ''}
                          </Text>
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>启用</Text>
                          <Ionicons name={!script.disabled ? 'checkmark-circle' : 'close-circle'} size={18} color={!script.disabled ? theme.colors.primary : '#ccc'} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
            }
            {regexManaging && (
              <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: theme.colors.danger,
                    borderRadius: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 24,
                  }}
                  onPress={handleDeleteRegexScripts}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>删除选中脚本</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}