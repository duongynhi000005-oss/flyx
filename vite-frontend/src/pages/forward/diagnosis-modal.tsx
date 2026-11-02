import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { Button } from "@/shadcn-bridge/heroui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import { Spinner } from "@/shadcn-bridge/heroui/spinner";
import { Alert } from "@/shadcn-bridge/heroui/alert";
import {
  getForwardDiagnosisQualityDisplay,
  type ForwardDiagnosisResult,
} from "@/pages/forward/diagnosis";
import { Forward } from "@/pages/forward/types";

export interface DiagnosisModalProps {
  currentDiagnosisForward: Forward | null;
  diagnosisAbortRef: MutableRefObject<AbortController | null>;
  diagnosisLoading: boolean;
  diagnosisModalOpen: boolean;
  diagnosisProgress: {
    total: number;
    completed: number;
    success: number;
    failed: number;
    timedOut: boolean;
  };
  diagnosisResult: ForwardDiagnosisResult | null;
  handleDiagnose: (forward: Forward) => Promise<void>;
  setDiagnosisLoading: Dispatch<SetStateAction<boolean>>;
  setDiagnosisModalOpen: Dispatch<SetStateAction<boolean>>;
}

/** Diagnosis results for one forward, streamed as they arrive. */
export function DiagnosisModal({
  currentDiagnosisForward,
  diagnosisAbortRef,
  diagnosisLoading,
  diagnosisModalOpen,
  diagnosisProgress,
  diagnosisResult,
  handleDiagnose,
  setDiagnosisLoading,
  setDiagnosisModalOpen,
}: DiagnosisModalProps) {
  return (
    <Modal
      classNames={{
        base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full overflow-hidden",
      }}
      isOpen={diagnosisModalOpen}
      placement="center"
      scrollBehavior="inside"
      size="4xl"
      onOpenChange={(open) => {
        setDiagnosisModalOpen(open);
        if (!open) {
          diagnosisAbortRef.current?.abort();
          diagnosisAbortRef.current = null;
          setDiagnosisLoading(false);
        }
      }}
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader
              closable
              className="flex flex-col gap-1 border-b border-divider"
            >
              <h2 className="text-base font-semibold">规则诊断结果</h2>
              {currentDiagnosisForward && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-small text-default-500 truncate flex-1 min-w-0">
                    {currentDiagnosisForward.name}
                  </span>
                  <span className="shrink-0 text-xs text-default-400">
                    规则服务
                  </span>
                </div>
              )}
            </ModalHeader>
            <ModalBody className="bg-transparent">
              {diagnosisResult ? (
                <div className="space-y-4">
                  {diagnosisLoading && (
                    <div className="flex items-center justify-between border-b border-divider pb-3">
                      <div className="flex items-center gap-2 text-sm text-default-600">
                        <Spinner size="sm" />
                        <span>
                          正在诊断 {diagnosisProgress.completed}/
                          {diagnosisProgress.total > 0
                            ? diagnosisProgress.total
                            : "?"}
                        </span>
                      </div>
                      <span className="text-xs text-default-400">
                        流式更新中
                      </span>
                    </div>
                  )}

                  {diagnosisProgress.timedOut && (
                    <Alert
                      color="warning"
                      description="诊断超时（单条30秒 / 整体2分钟），以下为当前已完成结果。"
                      title="诊断超时"
                      variant="flat"
                    />
                  )}

                  {/* 统计摘要 */}
                  <div className="grid grid-cols-3 divide-x divide-divider border-y border-divider">
                    <div className="py-3 text-center">
                      <div className="text-2xl font-semibold tabular-nums text-foreground">
                        {diagnosisProgress.total > 0
                          ? diagnosisProgress.total
                          : diagnosisResult.results.length}
                      </div>
                      <div className="text-xs text-default-500 mt-1">
                        总测试数
                      </div>
                    </div>
                    <div className="py-3 text-center">
                      <div className="text-2xl font-semibold tabular-nums text-success">
                        {diagnosisProgress.completed > 0 ||
                        diagnosisProgress.total > 0
                          ? diagnosisProgress.success
                          : diagnosisResult.results.filter((r) => r.success)
                              .length}
                      </div>
                      <div className="text-xs text-default-500 mt-1">成功</div>
                    </div>
                    <div className="py-3 text-center">
                      <div className="text-2xl font-semibold tabular-nums text-danger">
                        {diagnosisProgress.completed > 0 ||
                        diagnosisProgress.total > 0
                          ? diagnosisProgress.failed
                          : diagnosisResult.results.filter((r) => !r.success)
                              .length}
                      </div>
                      <div className="text-xs text-default-500 mt-1">失败</div>
                    </div>
                  </div>

                  {/* 桌面端表格展示 */}
                  <div className="hidden md:block space-y-3">
                    {(() => {
                      // 使用后端返回的 chainType 和 inx 字段进行分组
                      const groupedResults = {
                        entry: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 1,
                        ),
                        chains: {} as Record<
                          number,
                          typeof diagnosisResult.results
                        >,
                        exit: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 3,
                        ),
                      };

                      // 按 inx 分组链路测试
                      diagnosisResult.results.forEach((r) => {
                        if (r.fromChainType === 2 && r.fromInx != null) {
                          if (!groupedResults.chains[r.fromInx]) {
                            groupedResults.chains[r.fromInx] = [];
                          }
                          groupedResults.chains[r.fromInx].push(r);
                        }
                      });

                      const renderTableSection = (
                        title: string,
                        results: typeof diagnosisResult.results,
                      ) => {
                        if (results.length === 0) return null;

                        return (
                          <div
                            key={title}
                            className="border border-divider rounded-lg overflow-hidden"
                          >
                            <div className="px-3 py-2 border-b border-divider">
                              <h3 className="text-sm font-semibold text-foreground">
                                {title}
                              </h3>
                            </div>
                            <table className="w-full text-sm">
                              <thead className="border-b border-divider text-default-500">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-xs">
                                    路径
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-20">
                                    状态
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-24">
                                    延迟(ms)
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-24">
                                    丢包率
                                  </th>
                                  <th className="px-3 py-2 text-center font-semibold text-xs w-20">
                                    质量
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-divider">
                                {results.map((result, index) => {
                                  const isDiagnosing = Boolean(
                                    result.diagnosing,
                                  );
                                  const isSuccess = result.success === true;
                                  const quality =
                                    getForwardDiagnosisQualityDisplay(
                                      result.averageTime,
                                      result.packetLoss,
                                    );

                                  return (
                                    <tr
                                      key={index}
                                      className="hover:bg-default-50"
                                    >
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          {isDiagnosing ? (
                                            <Spinner size="sm" />
                                          ) : (
                                            <span
                                              className={`w-5 h-5 flex items-center justify-center text-sm ${
                                                isSuccess
                                                  ? "text-success"
                                                  : "text-danger"
                                              }`}
                                            >
                                              {isSuccess ? "✓" : "✗"}
                                            </span>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-foreground truncate">
                                              {result.description}
                                            </div>
                                            <div className="text-xs text-default-500 truncate">
                                              {result.targetIp}:
                                              {result.targetPort}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <Chip
                                          color={
                                            isDiagnosing
                                              ? "warning"
                                              : isSuccess
                                                ? "success"
                                                : "danger"
                                          }
                                          size="sm"
                                          variant="flat"
                                        >
                                          {isDiagnosing
                                            ? "诊断中"
                                            : isSuccess
                                              ? "成功"
                                              : "失败"}
                                        </Chip>
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {isSuccess ? (
                                          <span className="font-semibold text-primary">
                                            {result.averageTime?.toFixed(0)}
                                          </span>
                                        ) : (
                                          <span className="text-default-400">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {isSuccess ? (
                                          <span
                                            className={`font-semibold ${
                                              (result.packetLoss || 0) > 0
                                                ? "text-warning"
                                                : "text-success"
                                            }`}
                                          >
                                            {result.packetLoss?.toFixed(1)}%
                                          </span>
                                        ) : (
                                          <span className="text-default-400">
                                            -
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        {isSuccess && quality ? (
                                          <Chip
                                            className="text-xs whitespace-nowrap"
                                            color={quality.color as any}
                                            size="sm"
                                            variant="flat"
                                          >
                                            {quality.text}
                                          </Chip>
                                        ) : (
                                          <span className="text-default-400">
                                            -
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      };

                      return (
                        <>
                          {/* 入口测试 */}
                          {renderTableSection(
                            "🚪 入口测试",
                            groupedResults.entry,
                          )}

                          {/* 链路测试（按跳数排序） */}
                          {Object.keys(groupedResults.chains)
                            .map(Number)
                            .sort((a, b) => a - b)
                            .map((hop) =>
                              renderTableSection(
                                `🔗 转发链 - 第${hop}跳`,
                                groupedResults.chains[hop],
                              ),
                            )}

                          {/* 出口测试 */}
                          {renderTableSection(
                            "🚀 出口测试",
                            groupedResults.exit,
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* 移动端卡片展示 */}
                  <div className="md:hidden space-y-3">
                    {(() => {
                      // 使用后端返回的 chainType 和 inx 字段进行分组
                      const groupedResults = {
                        entry: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 1,
                        ),
                        chains: {} as Record<
                          number,
                          typeof diagnosisResult.results
                        >,
                        exit: diagnosisResult.results.filter(
                          (r) => r.fromChainType === 3,
                        ),
                      };

                      // 按 inx 分组链路测试
                      diagnosisResult.results.forEach((r) => {
                        if (r.fromChainType === 2 && r.fromInx != null) {
                          if (!groupedResults.chains[r.fromInx]) {
                            groupedResults.chains[r.fromInx] = [];
                          }
                          groupedResults.chains[r.fromInx].push(r);
                        }
                      });

                      const renderCardSection = (
                        title: string,
                        results: typeof diagnosisResult.results,
                      ) => {
                        if (results.length === 0) return null;

                        return (
                          <div key={title} className="space-y-2">
                            <div className="border-b border-divider pb-1.5">
                              <h3 className="text-sm font-semibold text-foreground">
                                {title}
                              </h3>
                            </div>
                            {results.map((result, index) => {
                              const isDiagnosing = Boolean(result.diagnosing);
                              const isSuccess = result.success === true;
                              const quality = getForwardDiagnosisQualityDisplay(
                                result.averageTime,
                                result.packetLoss,
                              );

                              return (
                                <div
                                  key={index}
                                  className="border-b border-divider py-3 last:border-b-0"
                                >
                                  <div className="flex items-start gap-2 mb-2">
                                    {isDiagnosing ? (
                                      <Spinner size="sm" />
                                    ) : (
                                      <span
                                        className={`w-6 h-6 flex items-center justify-center text-sm flex-shrink-0 ${
                                          isSuccess
                                            ? "text-success"
                                            : "text-danger"
                                        }`}
                                      >
                                        {isSuccess ? "✓" : "✗"}
                                      </span>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-semibold text-sm text-foreground break-words">
                                        {result.description}
                                      </div>
                                      <div className="text-xs text-default-500 mt-0.5 break-all">
                                        {result.targetIp}:{result.targetPort}
                                      </div>
                                    </div>
                                    <Chip
                                      className="flex-shrink-0"
                                      color={
                                        isDiagnosing
                                          ? "warning"
                                          : isSuccess
                                            ? "success"
                                            : "danger"
                                      }
                                      size="sm"
                                      variant="flat"
                                    >
                                      {isDiagnosing
                                        ? "诊断中"
                                        : isSuccess
                                          ? "成功"
                                          : "失败"}
                                    </Chip>
                                  </div>

                                  {isSuccess ? (
                                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-divider">
                                      <div className="text-center">
                                        <div className="text-lg font-bold text-primary">
                                          {result.averageTime?.toFixed(0)}
                                        </div>
                                        <div className="text-xs text-default-500">
                                          延迟(ms)
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        <div
                                          className={`text-lg font-bold ${
                                            (result.packetLoss || 0) > 0
                                              ? "text-warning"
                                              : "text-success"
                                          }`}
                                        >
                                          {result.packetLoss?.toFixed(1)}%
                                        </div>
                                        <div className="text-xs text-default-500">
                                          丢包率
                                        </div>
                                      </div>
                                      <div className="text-center">
                                        {quality && (
                                          <>
                                            <Chip
                                              className="text-xs whitespace-nowrap"
                                              color={quality.color as any}
                                              size="sm"
                                              variant="flat"
                                            >
                                              {quality.text}
                                            </Chip>
                                            <div className="text-xs text-default-500 mt-0.5">
                                              质量
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mt-2 pt-2 border-t border-divider">
                                      <div
                                        className={`text-xs ${
                                          isDiagnosing
                                            ? "text-warning"
                                            : "text-danger"
                                        }`}
                                      >
                                        {isDiagnosing
                                          ? result.message || "诊断中..."
                                          : result.message || "连接失败"}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      };

                      return (
                        <>
                          {/* 入口测试 */}
                          {renderCardSection(
                            "🚪 入口测试",
                            groupedResults.entry,
                          )}

                          {/* 链路测试（按跳数排序） */}
                          {Object.keys(groupedResults.chains)
                            .map(Number)
                            .sort((a, b) => a - b)
                            .map((hop) =>
                              renderCardSection(
                                `🔗 转发链 - 第${hop}跳`,
                                groupedResults.chains[hop],
                              ),
                            )}

                          {/* 出口测试 */}
                          {renderCardSection(
                            "🚀 出口测试",
                            groupedResults.exit,
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* 失败详情（仅桌面端显示，移动端已在卡片中显示） */}
                  {diagnosisResult.results.some(
                    (r) => r.success === false && !r.diagnosing,
                  ) && (
                    <div className="space-y-2 hidden md:block">
                      <h4 className="text-sm font-semibold">失败详情</h4>
                      <div className="divide-y divide-divider border-y border-divider">
                        {diagnosisResult.results
                          .filter((r) => r.success === false && !r.diagnosing)
                          .map((result, index) => (
                            <div key={index} className="py-2 text-xs">
                              <div className="text-default-500">
                                {result.description}
                              </div>
                              <div className="mt-0.5 text-danger">
                                {result.message || "连接失败"}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4">
                    <svg
                      aria-hidden="true"
                      className="w-8 h-8 text-default-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    暂无诊断数据
                  </h3>
                </div>
              )}
            </ModalBody>
            <ModalFooter className="border-t border-divider">
              {currentDiagnosisForward && (
                <Button
                  color="primary"
                  isLoading={diagnosisLoading}
                  onPress={() => handleDiagnose(currentDiagnosisForward)}
                >
                  重新诊断
                </Button>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
