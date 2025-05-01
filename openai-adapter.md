## 构建与 OpenAI 兼容的 Hajimi 适配器

本文档提供构建适配器的指导，该适配器允许开发人员使用 OpenAI API 格式与 Hajimi 交互。该适配器支持自定义 URL 端点、API 密钥和模型名称映射。

## 介绍

Hajimi 提供了一个与 OpenAI 兼容的 API，这使得为 OpenAI 的 API 设计的应用程序只需进行最少的更改即可使用。 但是，您可能希望在应用程序中创建一个专用的适配器层，以便更好地控制如何将请求发送到 Hajimi。

## 适配器的核心功能

- 以 OpenAI 兼容的格式发送请求
- 配置自定义 URL 端点
- 管理 API 密钥
- 在您的应用程序和 Hajimi 之间映射模型名称
- 以一致的格式处理响应

## 基本适配器实现

以下是使用 `requests` 库的 Python 基本实现：

```python
import requests
import json
from typing import List, Dict, Any, Optional, Union

class HajimiAdapter:
    """
    使用 OpenAI 兼容格式连接到 Hajimi 的适配器。
    """
    
    def __init__(
        self, 
        base_url: str = "http://localhost:8000", 
        api_key: str = "your-api-key-here",
        default_model: str = "gemini-1.5-pro",
        model_mapping: Dict[str, str] = None
    ):
        """
        初始化 Hajimi 适配器。
        
        Args:
            base_url: Hajimi 服务的基准 URL
            api_key: 用于身份验证的 API 密钥
            default_model: 如果未指定模型，则使用的默认模型
            model_mapping: 从用户友好的名称到实际模型名称的字典映射
        """
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.default_model = default_model
        self.model_mapping = model_mapping or {
            "gpt-3.5-turbo": "gemini-1.0-pro",
            "gpt-4": "gemini-1.5-pro",
            "gpt-4-turbo": "gemini-1.5-pro",
            # 在此处添加您的自定义映射
        }
        
        # API 端点
        self.chat_completion_url = f"{self.base_url}/v1/chat/completions"
        self.models_url = f"{self.base_url}/v1/models"
        
    def _get_headers(self) -> Dict[str, str]:
        """
        获取带有身份验证的请求标头。
        
        Returns:
            标头字典
        """
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
    def _map_model(self, model: str) -> str:
        """
        将请求的模型名称映射到相应的 Hajimi 模型。
        
        Args:
            model: 用户提供的模型名称
            
        Returns:
            Hajimi 的映射模型名称
        """
        return self.model_mapping.get(model, model)
        
    def chat_completion(
        self, 
        messages: List[Dict[str, str]],
        model: str = None,
        temperature: float = 0.7,
        max_tokens: int = None,
        stream: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        向 Hajimi 发送聊天完成请求。
        
        Args:
            messages: 具有 'role' 和 'content' 的消息对象列表
            model: 要使用的模型名称
            temperature: 控制随机性 (0-1)
            max_tokens: 要生成的最大令牌数
            stream: 是否流式传输响应
            **kwargs: 传递给 API 的其他参数
            
        Returns:
            来自 API 的响应
        """
        # 确定要使用的模型
        model_to_use = self._map_model(model) if model else self.default_model
        
        # 准备请求数据
        request_data = {
            "model": model_to_use,
            "messages": messages,
            "temperature": temperature,
            "stream": stream
        }
        
        # 如果提供，则添加 max_tokens
        if max_tokens:
            request_data["max_tokens"] = max_tokens
            
        # 添加任何其他参数
        request_data.update(kwargs)
        
        # 发送请求
        response = requests.post(
            self.chat_completion_url,
            headers=self._get_headers(),
            json=request_data
        )
        
        # 处理非流式传输响应
        if not stream:
            if response.status_code == 200:
                return response.json()
            else:
                response.raise_for_status()
                
        # 处理流式传输响应
        else:
            return response
            
    def list_models(self) -> Dict[str, Any]:
        """
        从 Hajimi 获取可用模型。
        
        Returns:
            包含可用模型的 JSON 响应
        """
        response = requests.get(
            self.models_url,
            headers=self._get_headers()
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            response.raise_for_status()
```

## 高级用法

### 流式传输响应

对于流式传输响应，可以使用以下模式：

```python
def process_stream(response):
    """处理来自 API 的流式传输响应。"""
    for line in response.iter_lines():
        if line:
            # 如果存在，则删除 'data: ' 前缀
            line = line.decode('utf-8')
            if line.startswith('data: '):
                line = line[6:]
                
            # 检查流的结束
            if line == '[DONE]':
                break
                
            # 解析并生成数据
            try:
                data = json.loads(line)
                yield data
            except json.JSONDecodeError:
                continue

# 流式传输的示例用法
adapter = HajimiAdapter(
    base_url="http://your-hajimi-instance.com",
    api_key="your-api-key-here"
)

messages = [
    {"role": "system", "content": "你是一个乐于助人的助手。"},
    {"role": "user", "content": "写一首关于编程的短诗。"}
]

response = adapter.chat_completion(
    messages=messages,
    model="gemini-1.5-pro",
    stream=True
)

for chunk in process_stream(response):
    content = chunk.get('choices', [{}])[0].get('delta', {}).get('content', '')
    if content:
        print(content, end='')
```

### 自定义模型映射

您可以在应用程序的模型名称和 Hajimi 支持的模型之间创建自定义映射：

```python
adapter = HajimiAdapter(
    base_url="http://your-hajimi-instance.com",
    api_key="your-api-key-here",
    model_mapping={
        "my-fast-model": "gemini-1.0-pro",
        "my-smart-model": "gemini-1.5-pro",
        "my-creative-model": "gemini-1.5-flash"
    }
)

# 现在您可以使用自定义模型名称
response = adapter.chat_completion(
    messages=[{"role": "user", "content": "你好，你好吗？"}],
    model="my-smart-model"
)
```

## 错误处理

适配器应包括适当的错误处理：

```python
def chat_completion(self, messages, model=None, **kwargs):
    try:
        # 与以前相同的实现
        # ...
    except requests.exceptions.RequestException as e:
        # 处理网络错误
        return {
            "error": {
                "message": f"网络错误：{str(e)}",
                "type": "network_error",
                "code": 500
            }
        }
    except Exception as e:
        # 处理意外错误
        return {
            "error": {
                "message": f"意外错误：{str(e)}",
                "type": "unexpected_error",
                "code": 500
            }
        }
```

## 支持多个端点

对于需要在不同 Hajimi 实例之间切换的应用程序：

```python
class MultiEndpointHajimiAdapter:
    def __init__(self, endpoints=None):
        """
        使用多个端点初始化。
        
        Args:
            endpoints: 具有其配置的命名端点字典
        """
        self.endpoints = endpoints or {
            "default": {
                "base_url": "http://localhost:8000",
                "api_key": "your-default-api-key",
                "model_mapping": {"gpt-3.5-turbo": "gemini-1.0-pro"}
            }
        }
        self.active_endpoint = "default"
        self.adapters = {}
        
        # 初始化每个端点的适配器
        for name, config in self.endpoints.items():
            self.adapters[name] = HajimiAdapter(**config)
    
    def set_active_endpoint(self, endpoint_name):
        """更改活动端点。"""
        if endpoint_name in self.adapters:
            self.active_endpoint = endpoint_name
            return True
        return False
    
    def add_endpoint(self, name, config):
        """添加新的端点配置。"""
        self.endpoints[name] = config
        self.adapters[name] = HajimiAdapter(**config)
    
    # 将方法委托给活动适配器
    def chat_completion(self, *args, **kwargs):
        return self.adapters[self.active_endpoint].chat_completion(*args, **kwargs)
    
    def list_models(self):
        return self.adapters[self.active_endpoint].list_models()
```

## 与 Web 应用程序集成

将适配器与 Flask Web 应用程序集成的示例：

```python
from flask import Flask, request, jsonify
from hajimi_adapter import HajimiAdapter

app = Flask(__name__)
adapter = HajimiAdapter(
    base_url="http://your-hajimi-instance.com",
    api_key="your-api-key-here"
)

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.json
    messages = data.get("messages", [])
    model = data.get("model", "gemini-1.5-pro")
    
    response = adapter.chat_completion(
        messages=messages,
        model=model,
        temperature=data.get("temperature", 0.7),
        max_tokens=data.get("max_tokens")
    )
    
    return jsonify(response)

if __name__ == "__main__":
    app.run(debug=True)
```

## 安全注意事项

1. **API 密钥管理**：安全地存储 API 密钥，切勿在应用程序中对其进行硬编码。
2. **输入验证**：在将用户输入传递给适配器之前，始终对其进行验证。
3. **错误处理**：不要在错误消息中公开敏感信息。
4. **速率限制**：实施速率限制以防止滥用。

## 故障排除

### 常见问题

1. **身份验证错误**
   - 检查您的 API 密钥是否有效
   - 确保 API 密钥以正确的格式发送

2. **未找到模型**
   - 验证模型名称是否正确
   - 检查您的 Hajimi 实例中是否提供了该模型

3. **连接问题**
   - 确认基准 URL 是否正确
   - 检查到 Hajimi 服务器的网络连接

## 结论

通过使用此适配器模式，您可以轻松地将 Hajimi 的 OpenAI 兼容 API 集成到您的应用程序中，同时保持自定义的灵活性。 该适配器提供了一个干净的界面，用于发送请求、管理端点和以一致的格式处理响应。

## 其他语言的示例实现

### JavaScript (Node.js)

```javascript
const axios = require('axios');

class HajimiAdapter {
  constructor({
    baseUrl = 'http://localhost:8000',
    apiKey = 'your-api-key-here',
    defaultModel = 'gemini-1.5-pro',
    modelMapping = null
  } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.modelMapping = modelMapping || {
      'gpt-3.5-turbo': 'gemini-1.0-pro',
      'gpt-4': 'gemini-1.5-pro'
    };
    
    this.chatCompletionUrl = `${this.baseUrl}/v1/chat/completions`;
    this.modelsUrl = `${this.baseUrl}/v1/models`;
  }
  
  _getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }
  
  _mapModel(model) {
    return this.modelMapping[model] || model;
  }
  
  async chatCompletion(messages, {
    model = null,
    temperature = 0.7,
    maxTokens = null,
    stream = false,
    ...otherParams
  } = {}) {
    const modelToUse = model ? this._mapModel(model) : this.defaultModel;
    
    const requestData = {
      model: modelToUse,
      messages,
      temperature,
      stream,
      ...otherParams
    };
    
    if (maxTokens) {
      requestData.max_tokens = maxTokens;
    }
    
    try {
      const response = await axios.post(
        this.chatCompletionUrl,
        requestData,
        {
          headers: this._getHeaders(),
          responseType: stream ? 'stream' : 'json'
        }
      );
      
      return stream ? response : response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error(`No response from server: ${error.request}`);
      } else {
        throw new Error(`Error creating request: ${error.message}`);
      }
    }
  }
  
  async listModels() {
    try {
      const response = await axios.get(
        this.modelsUrl,
        { headers: this._getHeaders() }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get models: ${error.message}`);
    }
  }
}

module.exports = { HajimiAdapter };