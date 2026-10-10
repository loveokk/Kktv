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
                        <img src="/qq-qr.png" alt="QQ 好友二维码" />
                        <span>QQ: 747474642</span>
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
