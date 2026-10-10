import { QqOutlined } from "@ant-design/icons";
import { Popover } from "antd";

export function WorkspaceSidebarSocialLinks() {
    return (
        <div className="app-workspace-social-links">
            <Popover
                trigger="hover"
                placement="top"
                arrow={false}
                mouseEnterDelay={0}
                mouseLeaveDelay={0}
                rootClassName="app-workspace-qq-popover"
                content={
                    <div className="app-workspace-qq-card">
                        <img src="/qq-qr.png" alt="QQ 好友二维码" style={{ display: "block", width: "180px", height: "198px", objectFit: "contain", borderRadius: "10px" }} />
                        <span style={{ color: "#333", fontSize: "12px", fontWeight: 600 }}>QQ: 747474642</span>
                    </div>
                }
            >
                <button type="button" className="app-workspace-social-action" aria-label="查看 QQ 二维码" title="QQ">
                    <QqOutlined />
                </button>
            </Popover>
        </div>
    );
}
